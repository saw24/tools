<?php
// Handle preflight request
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    exit(0);
}

header("Access-Control-Allow-Origin: *");

// Read the input (discard it instantly to simulate server accepting data)
$handle = fopen("php://input", "rb");
while (!feof($handle)) {
    fread($handle, 8192);
}
fclose($handle);

http_response_code(200);
echo json_encode(["status" => "success"]);
?>