//! Session storage in the OS credential store.
//!
//! PLAN.md section 3 accepted, as a v1 shortcut, that the kiosk session would sit in a plain
//! file in the app-data directory — "the real control here is physical". This replaces that
//! with the platform's own secret store: Credential Manager on Windows, Keychain on macOS,
//! the Secret Service on Linux.
//!
//! Three commands, nothing more. They exist so the Supabase client's token storage can be
//! redirected at the keyring; all the session logic stays in TypeScript.
//!
//! Note the Linux feature choice in Cargo.toml: `sync-secret-service`, not `linux-native`.
//! The native keyutils backend keeps secrets in the kernel keyring, which does **not** survive
//! a reboot — on a device whose whole point is coming back up signed in after a power cut,
//! that would quietly undo the feature.

use keyring::Entry;

/// Namespaces the entries so they are identifiable in the OS credential UI.
const SERVICE: &str = "com.cvsu.qrkiosk";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring unavailable: {e}"))
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        // Not an error: a device that has never been signed in simply has no entry.
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read secret: {e}")),
    }
}

/// Windows' Credential Manager rejects anything over 2560 UTF-16 characters, measured here
/// (see the test below). Nothing stored through these commands may exceed it — which is why
/// the Supabase session is NOT stored here directly; see secure-storage.ts for the envelope
/// scheme that keeps only a 32-byte key in the credential store.
const MAX_SECRET_CHARS: usize = 1200;

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    // Fail loudly and early rather than letting the platform reject it deeper down, where the
    // only symptom was a device that silently would not stay signed in.
    if value.chars().count() > MAX_SECRET_CHARS {
        return Err(format!(
            "secret is {} characters; the platform credential store caps this near {}.              Store a key here and keep the payload elsewhere.",
            value.chars().count(),
            MAX_SECRET_CHARS
        ));
    }

    entry(&key)?
        .set_password(&value)
        .map_err(|e| format!("could not store secret: {e}"))
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        // Deleting what was never there is the desired end state, not a failure.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not delete secret: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards the reason `secure-storage.ts` encrypts the session into localStorage instead of
    /// putting it in the credential store directly.
    ///
    /// Measured on Windows 11: 1024 characters stores fine, 2048 is refused with "longer than
    /// platform limit of 2560 chars". A Supabase session is 2-5 KB, so storing it here cannot
    /// work — and when it failed it did so silently, which read as "logged out again".
    /// Windows-only: macOS and Linux have no comparable limit.
    #[cfg(target_os = "windows")]
    #[test]
    fn credential_store_cannot_hold_a_session_sized_secret() {
        let key = "size-guard-probe";
        let session_sized = "x".repeat(4096);

        let result = Entry::new(SERVICE, key).and_then(|e| e.set_password(&session_sized));
        assert!(
            result.is_err(),
            "the credential store accepted 4 KB - if this ever passes, the envelope scheme in              secure-storage.ts could be simplified away"
        );

        // A key-sized secret must still fit, or the envelope scheme itself breaks.
        let key_sized = "x".repeat(64);
        Entry::new(SERVICE, key)
            .and_then(|e| e.set_password(&key_sized))
            .expect("a 64-character key must fit in the credential store");
        let _ = Entry::new(SERVICE, key).and_then(|e| e.delete_credential());
    }
}
