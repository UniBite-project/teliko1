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
    $action = $_GET['action'] ?? $data['action'] ?? 'profile';
    $userId = currentUserId($data);
    $pdo = db();

    if ($action === 'profile') {
        $stmt = $pdo->prepare(
            "SELECT
                u.user_id, u.username, u.email, u.full_name, u.university_id,
                u.department, u.role, u.points, u.created_at,
                (SELECT COUNT(*) FROM listings WHERE user_id = u.user_id AND status = 'active' AND expires_at > NOW()) AS active_listings,
                (SELECT COALESCE(SUM(r.requested_portions), 0)
                 FROM listings l
                 JOIN requests r ON r.listing_id = l.listing_id
                 WHERE l.user_id = u.user_id AND r.status = 'received') AS offered_portions,
                (SELECT COALESCE(SUM(requested_portions), 0)
                 FROM requests
                 WHERE requester_id = u.user_id AND status = 'received') AS received_portions,
                (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE cook_id = u.user_id) AS average_rating
             FROM users u
             WHERE u.user_id = ?"
        );
        $stmt->execute([$userId]);
        $profile = $stmt->fetch();

        if (!$profile) {
            out(['ok' => false, 'message' => 'Δεν βρέθηκε ο λογαριασμός.'], 404);
        }

        out(['ok' => true, 'profile' => $profile]);
    }

    if ($action === 'delete') {
        $stmt = $pdo->prepare("SELECT role FROM users WHERE user_id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            out(['ok' => false, 'message' => 'Δεν βρέθηκε ο λογαριασμός.'], 404);
        }
        if ($user['role'] === 'admin') {
            out(['ok' => false, 'message' => 'Δεν επιτρέπεται διαγραφή admin λογαριασμού από αυτή τη σελίδα.'], 403);
        }

        $delete = $pdo->prepare("DELETE FROM users WHERE user_id = ?");
        $delete->execute([$userId]);
        $_SESSION = [];
        session_destroy();

        out(['ok' => true, 'message' => 'Ο λογαριασμός διαγράφηκε οριστικά.']);
    }

    out(['ok' => false, 'message' => 'Άγνωστη ενέργεια.'], 400);
} catch (Throwable $e) {
    out(['ok' => false, 'message' => 'Σφάλμα server: ' . $e->getMessage()], 500);
}
