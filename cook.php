<?php
/**
 * UniBite – Cook Dashboard API  |  cook.php
 * Actions: get_listings, get_listing, create_listing,
 *          update_listing, delete_listing,
 *          get_requests, update_request
 *
 * Session must be started externally (e.g. from index.php) or
 * we start it here if not already running.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/auth.php';
requireLogin('student', true);

header('Content-Type: application/json; charset=utf-8');

/* ── DB Config ──────────────────────────────────────────── */
define('DB_HOST', 'localhost');
define('DB_NAME', 'unibite');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHAR', 'utf8mb4');

/* ── DB Connection (singleton) ──────────────────────────── */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $pdo = new PDO(
                'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHAR,
                DB_USER, DB_PASS,
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]
            );

            run_automated_cron_logic($pdo);

        } catch (PDOException $e) {
            json_error('Database connection failed: ' . $e->getMessage(), 500);
        }
    }
    return $pdo;
}

function run_automated_cron_logic(PDO $pdo): void {
    // 1. Αυτόματη απενεργοποίηση αγγελιών που έληξαν (48 ώρες) ή πέρασε η ώρα παραλαβής
    try {
        $pdo->exec("
            UPDATE listings 
            SET status = 'inactive' 
            WHERE status = 'active' 
              AND (expires_at <= NOW() OR pickup_end <= NOW() OR available_portions = 0)
        ");
    } catch (PDOException $e) {
        // Σιωπηλή αποτυχία για να μην επηρεαστεί η ροή του χρήστη αν η βάση είναι απασχολημένη
    }

    // 2. Ποινή Μη Αξιολόγησης (48 ώρες από την παραλαβή)
    try {
        $pdo->beginTransaction();
        
        // Επιλογή αιτημάτων που έχουν ολοκληρωθεί (received) προ 48 ωρών και δεν έχουν ποινή/αξιολόγηση
        $stmt = $pdo->query("
            SELECT request_id, requester_id, listing_id 
            FROM requests 
            WHERE status = 'received' 
              AND received_at <= DATE_SUB(NOW(), INTERVAL 48 HOUR) 
              AND no_rating_penalty_applied = 0
        ");
        $requests_to_penalize = $stmt->fetchAll();

        foreach ($requests_to_penalize as $req) {
            // Έλεγχος αν ο χρήστης εν τέλει έκανε αξιολόγηση (για ασφάλεια)
            $checkRating = $pdo->prepare("
                SELECT COUNT(*) FROM ratings 
                WHERE request_id = :rid OR (listing_id = :lid AND user_id = :uid)
            ");
            
            $has_rated = false;
            try {
                $checkRating->execute([
                    ':rid' => $req['request_id'],
                    ':lid' => $req['listing_id'],
                    ':uid' => $req['requester_id']
                ]);
                $has_rated = $checkRating->fetchColumn() > 0;
            } catch (PDOException $ex) {
                // Αν ο πίνακας ratings διαφέρει ελαφρώς δομικά
            }

            if (!$has_rated) {
                // Αφαίρεση 1 πόντου από τον καταναλωτή
                $updUser = $pdo->prepare("UPDATE users SET points = GREATEST(0, points - 1) WHERE user_id = :uid");
                $updUser->execute([':uid' => $req['requester_id']]);

                // Καταγραφή της αρνητικής συναλλαγής πόντων
                $logTrans = $pdo->prepare("
                    INSERT INTO point_transactions (user_id, amount, reason) 
                    VALUES (:uid, -1, 'Ποινή: Εκπρόθεσμη αξιολόγηση γεύματος (όριο 48 ωρών)')
                ");
                $logTrans->execute([':uid' => $req['requester_id']]);
            }

            // Σήμανση του αιτήματος ώστε να μην ξαναελεγχθεί για ποινή
            $updReq = $pdo->prepare("UPDATE requests SET no_rating_penalty_applied = 1 WHERE request_id = :rid");
            $updReq->execute([':rid' => $req['request_id']]);
        }

        $pdo->commit();
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    }
}

/* ── Response helpers ───────────────────────────────────── */
function json_ok(array $payload = []): void {
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}
function json_error(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ── Upload helper ──────────────────────────────────────── */
function handle_upload(): ?string {
    if (empty($_FILES['image']) || $_FILES['image']['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        json_error('Σφάλμα μεταφόρτωσης αρχείου.');
    }
    $allowed = ['image/jpeg', 'image/png', 'image/gif'];
    $finfo   = new finfo(FILEINFO_MIME_TYPE);
    $mime    = $finfo->file($_FILES['image']['tmp_name']);
    if (!in_array($mime, $allowed, true)) {
        json_error('Μη επιτρεπτός τύπος αρχείου.');
    }
    if ($_FILES['image']['size'] > 5 * 1024 * 1024) {
        json_error('Το αρχείο υπερβαίνει τα 5 MB.');
    }
    $ext  = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif'][$mime];
    $dir  = __DIR__ . '/uploads/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $name = uniqid('img_', true) . '.' . $ext;
    $dest = $dir . $name;
    if (!move_uploaded_file($_FILES['image']['tmp_name'], $dest)) {
        json_error('Αδυναμία αποθήκευσης αρχείου.');
    }
    return 'uploads/' . $name;
}

/**
 * Μετατρέπει μια ώρα "HH:MM" σε πλήρες DATETIME ("YYYY-MM-DD HH:MM:SS")
 * επιλέγοντας ΣΗΜΕΡΑ ή ΑΥΡΙΟ ώστε το αποτέλεσμα να βρίσκεται πάντα στο
 * μέλλον (ή ίσο με το παρόν).
 *
 * Διορθώνει το πρόβλημα όπου μια αγγελία που δημιουργείται στις 23:00
 * για παραλαβή στις 00:30 θα γινόταν "σήμερα 00:30" (παρελθόν) με την
 * παλιά λογική, σπάζοντας το trigger check_pickup_window.
 */
function build_future_datetime(string $hhmm): string {
    $now      = new DateTime();
    $today    = $now->format('Y-m-d');
    $candidate = new DateTime($today . ' ' . $hhmm . ':00');

    /* Αν η ώρα έχει ήδη παρελθόν για σήμερα, μετάθεση στο αύριο */
    if ($candidate <= $now) {
        $candidate->modify('+1 day');
    }
    return $candidate->format('Y-m-d H:i:s');
}

/**
 * Validation της ώρας παραλαβής σε μορφή HH:MM.
 */
function validate_time_format(string $time): bool {
    return (bool) preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time);
}

/* ────────────────────────────────────────────────────────────
   ROUTER
──────────────────────────────────────────────────────────── */
$action = $_GET['action'] ?? '';

match ($action) {
    'get_listings'   => action_get_listings(),
    'get_listing'    => action_get_listing(),
    'create_listing' => action_create_listing(),
    'update_listing' => action_update_listing(),
    'delete_listing' => action_delete_listing(),
    'get_requests'   => action_get_requests(),
    'update_request' => action_update_request(),
    default          => json_error('Άγνωστη ενέργεια.', 404),
};

/* ════════════════════════════════════════════════════════════
   ACTION HANDLERS
════════════════════════════════════════════════════════════ */

/* ── GET /cook.php?action=get_listings ───────────────────── */
function action_get_listings(): void {
    $uid = current_user_id();
    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT listing_id, title, description, allergens,
                total_portions, available_portions,
                pickup_location, latitude, longitude,
                pickup_time, pickup_end, image_path, status,
                created_at, expires_at
         FROM listings
         WHERE user_id = :uid AND status != \'deleted\'
         ORDER BY created_at DESC'
    );
    $stmt->execute([':uid' => $uid]);
    json_ok(['listings' => $stmt->fetchAll()]);
}

/* ── GET /cook.php?action=get_listing&id=X ───────────────── */
function action_get_listing(): void {
    $uid = current_user_id();
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) json_error('Μη έγκυρο ID.');

    $stmt = db()->prepare(
        'SELECT * FROM listings WHERE listing_id = :id AND user_id = :uid LIMIT 1'
    );
    $stmt->execute([':id' => $id, ':uid' => $uid]);
    $listing = $stmt->fetch();
    if (!$listing) json_error('Η αγγελία δεν βρέθηκε.', 404);
    json_ok(['listing' => $listing]);
}

/* ── POST /cook.php?action=create_listing ────────────────── */
function action_create_listing(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Μέθοδος δεν επιτρέπεται.', 405);

    $uid   = current_user_id();
    $title = trim($_POST['title'] ?? '');
    $loc   = trim($_POST['pickup_location'] ?? '');
    $time  = trim($_POST['pickup_time'] ?? '');
    $total = (int) ($_POST['total_portions'] ?? 0);
    $desc  = trim($_POST['description'] ?? '');
    $all   = trim($_POST['allergens'] ?? '');

    if ($title === '' || $loc === '' || $time === '' || $total < 1) {
        json_error('Συμπλήρωσε όλα τα υποχρεωτικά πεδία.');
    }
    if (mb_strlen($title) > 150)    json_error('Ο τίτλος είναι πολύ μεγάλος (max 150 χαρακτήρες).');
    if (mb_strlen($loc) > 255)      json_error('Η τοποθεσία είναι πολύ μεγάλη (max 255 χαρακτήρες).');
    if (!validate_time_format($time)) json_error('Μη έγκυρη ώρα παραλαβής.');
    if ($total > 999) json_error('Η ποσότητα μερίδων είναι πολύ μεγάλη.');

    /* Build DATETIME from time input (HH:MM), rolling to tomorrow if needed */
    $pickup_dt  = build_future_datetime($time);
    $pickup_end = date('Y-m-d H:i:s', strtotime($pickup_dt) + 3600);

    $image_path = handle_upload();

    $stmt = db()->prepare(
        'INSERT INTO listings
            (user_id, title, description, allergens, total_portions, available_portions,
             pickup_location, pickup_time, pickup_end, image_path, status)
         VALUES
            (:uid, :title, :desc, :allergens, :total, :avail,
             :loc, :pickup_time, :pickup_end, :img, \'active\')'
    );
    $stmt->execute([
        ':uid'         => $uid,
        ':title'       => $title,
        ':desc'        => $desc,
        ':allergens'   => $all,
        ':total'       => $total,
        ':avail'       => $total,
        ':loc'         => $loc,
        ':pickup_time' => $pickup_dt,
        ':pickup_end'  => $pickup_end,
        ':img'         => $image_path,
    ]);
    json_ok(['listing_id' => (int) db()->lastInsertId()]);
}

/* ── POST /cook.php?action=update_listing ────────────────── */
function action_update_listing(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Μέθοδος δεν επιτρέπεται.', 405);

    $uid = current_user_id();
    $id = (int) ($_POST['listing_id'] ?? 0);

    if (!$id) json_error('Μη έγκυρο ID.');

    /* Ownership check + τρέχουσα κατάσταση μερίδων */
    $chk = db()->prepare(
        'SELECT listing_id, total_portions, available_portions, status
         FROM listings WHERE listing_id = :id AND user_id = :uid LIMIT 1'
    );
    $chk->execute([':id' => $id, ':uid' => $uid]);
    $existing = $chk->fetch();
    if (!$existing) json_error('Δεν έχεις δικαίωμα επεξεργασίας.', 403);
    if ($existing['status'] === 'deleted') json_error('Η αγγελία έχει διαγραφεί και δεν μπορεί να επεξεργαστεί.');

    $title = trim($_POST['title'] ?? '');
    $loc   = trim($_POST['pickup_location'] ?? '');
    $time  = trim($_POST['pickup_time'] ?? '');
    $total = (int) ($_POST['total_portions'] ?? 0);
    $desc  = trim($_POST['description'] ?? '');
    $all   = trim($_POST['allergens'] ?? '');

    if ($title === '' || $loc === '' || $time === '' || $total < 1) {
        json_error('Συμπλήρωσε όλα τα υποχρεωτικά πεδία.');
    }
    if (mb_strlen($title) > 150)    json_error('Ο τίτλος είναι πολύ μεγάλος (max 150 χαρακτήρες).');
    if (mb_strlen($loc) > 255)      json_error('Η τοποθεσία είναι πολύ μεγάλη (max 255 χαρακτήρες).');
    if (!validate_time_format($time)) json_error('Μη έγκυρη ώρα παραλαβής.');
    if ($total > 999) json_error('Η ποσότητα μερίδων είναι πολύ μεγάλη.');

    /* Πόσες μερίδες έχουν ήδη δεσμευτεί/δοθεί */
    $old_total = (int) $existing['total_portions'];
    $old_avail = (int) $existing['available_portions'];
    $used      = $old_total - $old_avail;

    if ($total < $used) {
        json_error("Δεν μπορείς να ορίσεις σύνολο μικρότερο από τις μερίδες που έχουν ήδη δοθεί/δεσμευτεί ($used).");
    }

    $new_avail = $total - $used;

    $pickup_dt  = build_future_datetime($time);
    $pickup_end = date('Y-m-d H:i:s', strtotime($pickup_dt) + 3600);

    $new_image  = handle_upload();

    if ($new_image) {

        $oldImgStmt = db()->prepare(
            'SELECT image_path
            FROM listings
            WHERE listing_id = :id
            LIMIT 1'
        );

        $oldImgStmt->execute([
            ':id' => $id
        ]);

        $oldImg = $oldImgStmt->fetchColumn();

        if ($oldImg) {

            $fullPath = __DIR__ . '/' . $oldImg;

            if (is_file($fullPath)) {
                @unlink($fullPath);
            }
        }
    }

    /* Επαναϋπολογισμός status: ενεργή αν υπάρχουν διαθέσιμες μερίδες, αλλιώς ανενεργή */
    $new_status = $new_avail > 0 ? 'active' : 'inactive';

    $params = [
        ':title'       => $title,
        ':desc'        => $desc,
        ':allergens'   => $all,
        ':total'       => $total,
        ':avail'       => $new_avail,
        ':loc'         => $loc,
        ':pickup_time' => $pickup_dt,
        ':pickup_end'  => $pickup_end,
        ':status'      => $new_status,
        ':id'          => $id,
        ':uid'         => $uid,
    ];

    $img_clause = '';
    if ($new_image) {
        $img_clause = ', image_path = :img';
        $params[':img'] = $new_image;
    }

    $stmt = db()->prepare(
        "UPDATE listings SET
            title = :title, description = :desc, allergens = :allergens,
            total_portions = :total, available_portions = :avail,
            pickup_location = :loc, pickup_time = :pickup_time, pickup_end = :pickup_end,
            status = :status
            $img_clause
         WHERE listing_id = :id AND user_id = :uid"
    );
    $stmt->execute($params);
    json_ok();
}

/* ── POST /cook.php?action=delete_listing ────────────────── */
function action_delete_listing(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Μέθοδος δεν επιτρέπεται.', 405);

    $uid  = current_user_id();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $id   = (int) ($body['listing_id'] ?? 0);
    if (!$id) json_error('Μη έγκυρο ID.');

    $pdo = db();

    /* Ownership check */
    $chk = $pdo->prepare('SELECT listing_id FROM listings WHERE listing_id = :id AND user_id = :uid LIMIT 1');
    $chk->execute([':id' => $id, ':uid' => $uid]);
    if (!$chk->fetch()) json_error('Δεν έχεις δικαίωμα διαγραφής.', 403);

    try {
        $pdo->beginTransaction();

        // ΔΙΟΡΘΩΘΗΚΕ: Αυτόματη απόρριψη εκκρεμών αιτημάτων (pending / approved) 
        // και αυτόματη επιστροφή των πόντων στους χρήστες μέσω των SQL Procedures.
        $reqStmt = $pdo->prepare("SELECT request_id FROM requests WHERE listing_id = :id AND status IN ('pending', 'approved')");
        $reqStmt->execute([':id' => $id]);
        $active_requests = $reqStmt->fetchAll();

        foreach ($active_requests as $r) {
            $rejectCall = $pdo->prepare("CALL RejectRequest(:rid)");
            $rejectCall->execute([':rid' => $r['request_id']]);
        }

        /* Διαγραφή αρχείου εικόνας */
        $getImg = $pdo->prepare('SELECT image_path FROM listings WHERE listing_id=:id LIMIT 1');
        $getImg->execute([':id'=>$id]);
        $img = $getImg->fetchColumn();
        if ($img) {
            $fullPath = __DIR__ . '/' . $img;
            if (is_file($fullPath)) {
                @unlink($fullPath);
            }
        }

        /* Soft-delete της αγγελίας */
        $stmt = $pdo->prepare("UPDATE listings SET status = 'deleted' WHERE listing_id = :id AND user_id = :uid");
        $stmt->execute([':id' => $id, ':uid' => $uid]);

        $pdo->commit();
        json_ok();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_error('Σφάλμα κατά τη διαγραφή της αγγελίας: ' . $e->getMessage());
    }
}

/* ── GET /cook.php?action=get_requests ───────────────────── */
function action_get_requests(): void {
    $uid = current_user_id();

    $stmt = db()->prepare(
        'SELECT r.request_id, r.listing_id, r.requested_portions, r.status,
                r.requested_at, r.approved_at, r.received_at,
                l.title,
                u.username AS requester_name, u.user_id AS requester_id
         FROM requests r
         JOIN listings l ON r.listing_id = l.listing_id
         JOIN users    u ON r.requester_id = u.user_id
         WHERE l.user_id = :uid
         ORDER BY
             FIELD(r.status, \'pending\', \'approved\', \'received\', \'rejected\', \'absent\'),
             r.requested_at ASC'
    );
    $stmt->execute([':uid' => $uid]);
    json_ok(['requests' => $stmt->fetchAll()]);
}

/* ── POST /cook.php?action=update_request ────────────────── */
function action_update_request(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Μέθοδος δεν επιτρέπεται.', 405);

    $uid    = current_user_id();
    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $rid    = (int) ($body['request_id'] ?? 0);
    $status = trim($body['status'] ?? '');

    $allowed = ['approved', 'rejected', 'received', 'absent'];
    if (!$rid || !in_array($status, $allowed, true)) {
        json_error('Μη έγκυρα δεδομένα.');
    }

    /* Verify the cook owns the listing associated with this request */
    $chk = db()->prepare(
        'SELECT r.request_id, r.status AS old_status
         FROM requests r
         JOIN listings l ON r.listing_id = l.listing_id
         WHERE r.request_id = :rid AND l.user_id = :uid
         LIMIT 1'
    );
    $chk->execute([':rid' => $rid, ':uid' => $uid]);
    $req = $chk->fetch();
    if (!$req) json_error('Αίτημα δεν βρέθηκε.', 404);

    $old = $req['old_status'];

    /* Transition guards */
    $valid_transitions = [
        'pending'  => ['approved', 'rejected'],
        'approved' => ['received', 'absent'],
    ];
    if (!isset($valid_transitions[$old]) || !in_array($status, $valid_transitions[$old], true)) {
        json_error("Δεν επιτρέπεται η μετάβαση από «$old» σε «$status».");
    }

    /* DB triggers handle portion restoration and point transactions.
       For 'approved'  → ApproveRequest procedure.
       For 'rejected'  → RejectRequest procedure.
       For 'received'  → ConfirmMealReceived procedure.
       For 'absent'    → ReportNoShow procedure.
    */
    $pdo = db();

    try {
        $pdo->beginTransaction();

        $proc_map = [
            'approved' => 'CALL ApproveRequest(:rid)',
            'rejected' => 'CALL RejectRequest(:rid)',
            'received' => 'CALL ConfirmMealReceived(:rid)',
            'absent'   => 'CALL ReportNoShow(:rid)',
        ];

        $stmt = $pdo->prepare($proc_map[$status]);
        $stmt->execute([':rid' => $rid]);
        $pdo->commit();
    } catch (PDOException $e) {
        $pdo->rollBack();
        /* Surface DB trigger messages to the client */
        json_error($e->getMessage());
    }

    json_ok();
}