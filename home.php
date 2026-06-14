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
    $action = $_GET['action'] ?? $data['action'] ?? 'summary';

    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        out(['ok' => true, 'message' => 'Αποσυνδεθήκατε επιτυχώς.']);
    }

    if ($action !== 'summary') {
        out(['ok' => false, 'message' => 'Άγνωστη ενέργεια.'], 400);
    }

    $userId = currentUserId($data);

    $stmt = db()->prepare(
        "SELECT user_id, username, email, full_name, role, points, department
         FROM users
         WHERE user_id = ?"
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) {
        out(['ok' => false, 'message' => 'Δεν βρέθηκε συνδεδεμένος χρήστης.'], 404);
    }

    $statsStmt = db()->prepare(
        "SELECT
            (SELECT COUNT(*) FROM listings WHERE user_id = ? AND status = 'active' AND expires_at > NOW()) AS active_listings,
            (SELECT COUNT(*)
             FROM requests r
             JOIN listings l ON l.listing_id = r.listing_id
             WHERE l.user_id = ? AND r.status = 'pending') AS pending_requests,
            (SELECT COALESCE(SUM(requested_portions), 0)
             FROM requests
             WHERE requester_id = ? AND status = 'received') AS portions_received,
            (SELECT COALESCE(SUM(r.requested_portions), 0)
             FROM listings l
             JOIN requests r ON r.listing_id = l.listing_id
             WHERE l.user_id = ? AND r.status = 'received') AS portions_shared"
    );
    $statsStmt->execute([$userId, $userId, $userId, $userId]);
    $stats = $statsStmt->fetch() ?: [];

    out([
        'ok' => true,
        'user' => $user,
        'stats' => $stats,
        'can_access_admin' => ($user['role'] === 'admin'),
    ]);
} catch (Throwable $e) {
    out(['ok' => false, 'message' => 'Σφάλμα server: ' . $e->getMessage()], 500);
}
