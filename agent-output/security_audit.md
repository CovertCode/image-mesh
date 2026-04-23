# Security Audit: PixelVault (image-mesh)

## 1. Critical Flaws

### 1.1 Plaintext API Keys
- **Location:** `src/routes/auth.js`, `src/middleware/auth.js`
- **Description:** API keys are generated and stored as raw hexadecimal strings in the `api_keys` table (column `key_hash`). Despite the column name, **no hashing occurs**.
- **Impact:** A database breach or an authorized user with read access to the database can compromise all system API keys.
- **Recommendation:** Use the existing `hashApiKey` function in `src/utils/crypto.js` to store only the SHA-256 hashes of keys.

### 1.2 Hardcoded Admin Backdoor
- **Location:** `src/middleware/auth.js`, `settings.json`
- **Description:** The system recognizes a static `admin_api_key` defined in the configuration. If provided in the `x-api-key` header, it bypasses database lookups and grants full administrative access (mapped to user ID 1).
- **Impact:** This is a hardcoded "master key." If leaked, an attacker has total control over the system.
- **Recommendation:** Replace this with a proper role-based access control (RBAC) system stored in the database.

### 1.3 Session Token Forgery
- **Location:** `src/routes/auth.js`
- **Description:** Session tokens are generated using `crypto.createHmac('sha256', settings.security.admin_api_key)`.
- **Impact:** The same "master key" used for admin access is used to sign all user sessions. If the admin key is compromised, an attacker can forge a session token for **any** user ID without knowing their password.
- **Recommendation:** Use a dedicated, randomly generated `SESSION_SECRET` that is distinct from any API key.

## 2. Potential SQL Injections
- **Status:** Generally Safe (Low Risk)
- **Analysis:** The project uses `better-sqlite3` with parameterized queries (`?` placeholders), which is the standard defense against SQL injection.
- **Area of Concern:** In `src/routes/images.js`, the SQL string for the GET `/` route is constructed dynamically:
  ```javascript
  let sql = `SELECT ... WHERE i.user_id = ?`;
  if (folder) sql += ` AND p.slug = ?`;
  ```
- **Verification:** While the string is dynamic, the values are still passed via the `params` array to `db.prepare(sql).all(params)`. This is safe, but developers should be careful not to accidentally interpolate variables directly into the string.

## 3. Hacks & Backdoors
- **Admin API Key:** As noted in 1.2, this acts as a built-in backdoor for the developers/administrators.
- **Plaintext Exposure:** The endpoint `GET /v1/auth/keys` returns the **full raw API keys** to the frontend. Standard security practice is to only show a masked version (e.g., `abcd...1234`) and show the full key only once upon creation.

## 4. Malicious Code Check
- **Result:** No explicitly malicious code (e.g., obfuscated reverse shells, data exfiltration to 3rd parties) was found.
- **Suspicious Patterns:** The use of `db.exec(schema)` in `src/db.js` is standard for migrations but should be monitored to ensure the `schema` string is never influenced by user input.

## 5. Security Summary Table

| Vulnerability | Severity | Status |
| :--- | :--- | :--- |
| Plaintext API Key Storage | **CRITICAL** | Confirmed |
| Hardcoded Master Key | **CRITICAL** | Confirmed |
| Session Token Forgery | **HIGH** | Confirmed |
| API Key Leakage via API | **HIGH** | Confirmed |
| SQL Injection | **LOW** | Mitigated |
| Path Traversal | **LOW** | Mitigated in `delivery.js` |
