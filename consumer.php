<?php
declare(strict_types=1);
session_start();
header('Content-Type: application/json; charset=utf-8');

const DB_HOST = 'localhost';
const DB_NAME = 'unibite';
const DB_USER = 'root';
const DB_PASS = '';

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function payload(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function currentUserId(array $data = []): int
{
    // Για demo χωρίς ολοκληρωμένο login. Αν έχεις login, κράτα μόνο το $_SESSION['user_id'].
    return (int)($_SESSION['user_id'] ?? $data['user_id'] ?? $_GET['user_id'] ?? 1);
}

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $data = payload();
    $action = $_GET['action'] ?? $data['action'] ?? 'listings';
    $pdo = db();

    if ($action === 'listings') {
        // Ασφάλεια σε περίπτωση που δεν τρέχει το MySQL event scheduler.
        $pdo->exec("UPDATE listings SET status = 'deleted' WHERE expires_at <= NOW() AND status <> 'deleted'");

        $stmt = $pdo->query(
            "SELECT
                l.listing_id, l.user_id AS chef_id, l.title, l.description, l.allergens,
                l.total_portions, l.available_portions, l.pickup_location,
                l.latitude, l.longitude, l.pickup_time, l.pickup_end, l.image_path,
                CASE WHEN l.available_portions <= 0 THEN 'inactive' ELSE l.status END AS status,
                l.created_at, l.expires_at,
                COALESCE(u.full_name, u.username) AS chef_name,
                COALESCE(cr.average_rating, 0) AS chef_rating,
                COALESCE(cr.total_reviews, 0) AS chef_reviews
             FROM listings l
             JOIN users u ON u.user_id = l.user_id
             LEFT JOIN chef_ratings_view cr ON cr.user_id = l.user_id
             WHERE l.status IN ('active', 'inactive')
               AND l.expires_at > NOW()
             ORDER BY (l.available_portions <= 0) ASC, l.created_at DESC"
        );

        out(['ok' => true, 'listings' => $stmt->fetchAll()]);
    }

    if ($action === 'reserve') {
        $userId = currentUserId($data);
        $listingId = (int)($data['listing_id'] ?? 0);
        $portions = max(1, (int)($data['portions'] ?? 1));

        if ($listingId <= 0) {
            out(['ok' => false, 'message' => 'Μη έγκυρη αγγελία.'], 422);
        }

        $check = $pdo->prepare(
            "SELECT l.listing_id, l.user_id AS chef_id, l.available_portions, l.status, l.expires_at, u.points
             FROM listings l
             JOIN users u ON u.user_id = :user_id
             WHERE l.listing_id = :listing_id"
        );
        $check->execute(['user_id' => $userId, 'listing_id' => $listingId]);
        $row = $check->fetch();

        if (!$row) {
            out(['ok' => false, 'message' => 'Η αγγελία δεν βρέθηκε.'], 404);
        }
        if ((int)$row['chef_id'] === $userId) {
            out(['ok' => false, 'message' => 'Δεν μπορείς να δεσμεύσεις δική σου αγγελία.'], 409);
        }
        if ($row['status'] === 'deleted' || strtotime((string)$row['expires_at']) <= time()) {
            out(['ok' => false, 'message' => 'Η αγγελία έχει λήξει.'], 409);
        }
        if ((int)$row['available_portions'] < $portions) {
            out(['ok' => false, 'message' => 'Δεν υπάρχουν αρκετές διαθέσιμες μερίδες.'], 409);
        }
        if ((int)$row['points'] < $portions) {
            out(['ok' => false, 'message' => 'Δεν έχεις αρκετούς πόντους για αυτή τη δέσμευση.'], 409);
        }

        $insert = $pdo->prepare(
            "INSERT INTO requests (listing_id, requester_id, requested_portions)
             VALUES (:listing_id, :requester_id, :requested_portions)"
        );
        $insert->execute([
            'listing_id' => $listingId,
            'requester_id' => $userId,
            'requested_portions' => $portions,
        ]);

        out([
            'ok' => true,
            'request_id' => (int)$pdo->lastInsertId(),
            'message' => 'Το αίτημα δέσμευσης στάλθηκε στον μάγειρα.',
        ]);
    }

    out(['ok' => false, 'message' => 'Άγνωστη ενέργεια.'], 400);
} catch (PDOException $e) {
    $message = $e->getCode() === '23000'
        ? 'Έχεις ήδη στείλει αίτημα για αυτή την αγγελία.'
        : 'Σφάλμα βάσης: ' . $e->getMessage();
    out(['ok' => false, 'message' => $message], 500);
} catch (Throwable $e) {
    out(['ok' => false, 'message' => 'Σφάλμα server: ' . $e->getMessage()], 500);
}
