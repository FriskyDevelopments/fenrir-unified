/** Supported locales */
export type Locale = "en" | "es" | "fr" | "de";

/**
 * Full i18n dictionary mirrored from fenrir-bot-mockup.html.
 * All 4 locales: en, es, fr, de.
 */
export const L: Record<Locale, Record<string, string>> = {
    en: {
        welcome_title: "🔐 Fenrir Lock",
        welcome_badge: "v2",
        welcome_text:
            "End-to-end invite locks for your community. No spam. No noise. Just control.",
        welcome_silent:
            "Silent by default — bot only responds on mention or DM.",
        btn_create: "✦ Create Lock",
        btn_my_locks: "⚙ My Locks",
        create_prompt: "Paste the domain you want to lock:",
        create_placeholder: "e.g. example.com",
        verifying: "Verifying DNS…",
        verified: "✓ DNS verified",
        creating: "Generating invite lock…",
        created: "✓ Lock generated",
        lock_ready_title: "🔐 Lock Ready",
        lock_ready_code: "fnr-8x4m-k2p9",
        lock_ready_line: "One-time invite locked to <code>example.com</code>",
        btn_copy: "📋 Copy Invite",
        btn_rotate: "🔄 Rotate",
        btn_revoke: "🗑 Revoke",
        rotating_title: "Rotating lock…",
        rotating_status: "Rotating invite key — 3s",
        rotated_title: "✓ Lock Rotated",
        rotated_code: "fnr-7w2z-q5t1",
        rotated_line: "Old invite killed. New one ready.",
        btn_copy_new: "📋 Copy New Invite",
        btn_back: "← Back",
        revoke_confirm:
            "Revoke this lock? The invite will be permanently invalidated.",
        revoke_yes: "Yes, revoke",
        revoke_cancel: "Cancel",
        revoked_title: "🔴 Revoked",
        revoked_line: "Lock for <code>example.com</code> has been revoked.",
        my_locks_title: "Your Locks",
        my_locks_empty: "No active locks.",
        my_locks_item: "<code>example.com</code> — fnr-8x4m…",
        my_locks_count: "1 active lock",
        copied: "✓ Copied!",
        error_generic: "Something went wrong. Try again.",
        error_invalid_domain: "That doesn't look like a valid domain.",
        lock_not_found: "Lock not found.",
    },
    es: {
        welcome_title: "🔐 Fenrir Lock",
        welcome_badge: "v2",
        welcome_text:
            "Bloqueos de invitación para tu comunidad. Sin spam. Sin ruido. Solo control.",
        welcome_silent:
            "Silencioso por defecto — el bot solo responde en mención o DM.",
        btn_create: "✦ Crear Bloqueo",
        btn_my_locks: "⚙ Mis Bloqueos",
        create_prompt: "Pega el dominio que quieres bloquear:",
        create_placeholder: "ej. example.com",
        verifying: "Verificando DNS…",
        verified: "✓ DNS verificado",
        creating: "Generando bloqueo de invitación…",
        created: "✓ Bloqueo generado",
        lock_ready_title: "🔐 Bloqueo Listo",
        lock_ready_code: "fnr-8x4m-k2p9",
        lock_ready_line:
            "Invitación única bloqueada a <code>example.com</code>",
        btn_copy: "📋 Copiar Invitación",
        btn_rotate: "🔄 Rotar",
        btn_revoke: "🗑 Revocar",
        rotating_title: "Rotando bloqueo…",
        rotating_status: "Rotando clave de invitación — 3s",
        rotated_title: "✓ Bloqueo Rotado",
        rotated_code: "fnr-7w2z-q5t1",
        rotated_line: "Invitación anterior eliminada. Nueva lista.",
        btn_copy_new: "📋 Copiar Nueva Invitación",
        btn_back: "← Volver",
        revoke_confirm:
            "¿Revocar este bloqueo? La invitación será invalidada permanentemente.",
        revoke_yes: "Sí, revocar",
        revoke_cancel: "Cancelar",
        revoked_title: "🔴 Revocado",
        revoked_line:
            "Bloqueo para <code>example.com</code> ha sido revocado.",
        my_locks_title: "Tus Bloqueos",
        my_locks_empty: "Sin bloqueos activos.",
        my_locks_item: "<code>example.com</code> — fnr-8x4m…",
        my_locks_count: "1 bloqueo activo",
        copied: "✓ ¡Copiado!",
        error_generic: "Algo salió mal. Intenta de nuevo.",
        error_invalid_domain: "Eso no parece un dominio válido.",
        lock_not_found: "Bloqueo no encontrado.",
    },
    fr: {
        welcome_title: "🔐 Fenrir Lock",
        welcome_badge: "v2",
        welcome_text:
            "Verrous d'invitation pour votre communauté. Pas de spam. Pas de bruit. Juste du contrôle.",
        welcome_silent:
            "Silencieux par défaut — le bot répond seulement sur mention ou MP.",
        btn_create: "✦ Créer un Verrou",
        btn_my_locks: "⚙ Mes Verrous",
        create_prompt: "Collez le domaine à verrouiller :",
        create_placeholder: "ex. example.com",
        verifying: "Vérification DNS…",
        verified: "✓ DNS vérifié",
        creating: "Génération du verrou d'invitation…",
        created: "✓ Verrou généré",
        lock_ready_title: "🔐 Verrou Prêt",
        lock_ready_code: "fnr-8x4m-k2p9",
        lock_ready_line:
            "Invitation unique verrouillée à <code>example.com</code>",
        btn_copy: "📋 Copier l'Invitation",
        btn_rotate: "🔄 Rotater",
        btn_revoke: "🗑 Révoquer",
        rotating_title: "Rotation du verrou…",
        rotating_status: "Rotation de la clé — 3s",
        rotated_title: "✓ Verrou Rotaté",
        rotated_code: "fnr-7w2z-q5t1",
        rotated_line: "Ancienne invitation tuée. Nouvelle prête.",
        btn_copy_new: "📋 Copier Nouvelle Invitation",
        btn_back: "← Retour",
        revoke_confirm:
            "Révoquer ce verrou ? L'invitation sera invalidée définitivement.",
        revoke_yes: "Oui, révoquer",
        revoke_cancel: "Annuler",
        revoked_title: "🔴 Révoqué",
        revoked_line:
            "Verrou pour <code>example.com</code> a été révoqué.",
        my_locks_title: "Mes Verrous",
        my_locks_empty: "Aucun verrou actif.",
        my_locks_item: "<code>example.com</code> — fnr-8x4m…",
        my_locks_count: "1 verrou actif",
        copied: "✓ Copié !",
        error_generic: "Quelque chose s'est mal passé. Réessayez.",
        error_invalid_domain: "Cela ne ressemble pas à un domaine valide.",
        lock_not_found: "Verrou non trouvé.",
    },
    de: {
        welcome_title: "🔐 Fenrir Lock",
        welcome_badge: "v2",
        welcome_text:
            "Einladungsschlösser für deine Community. Kein Spam. Kein Lärm. Nur Kontrolle.",
        welcome_silent:
            "Standardmäßig still — der Bot antwortet nur bei Erwähnung oder DM.",
        btn_create: "✦ Schloss Erstellen",
        btn_my_locks: "⚙ Meine Schlösser",
        create_prompt: "Füge die Domain ein, die du sperren möchtest:",
        create_placeholder: "z.B. example.com",
        verifying: "DNS wird überprüft…",
        verified: "✓ DNS bestätigt",
        creating: "Einladungsschloss wird generiert…",
        created: "✓ Schloss generiert",
        lock_ready_title: "🔐 Schloss Bereit",
        lock_ready_code: "fnr-8x4m-k2p9",
        lock_ready_line:
            "Einmalige Einladung gesperrt für <code>example.com</code>",
        btn_copy: "📋 Einladung Kopieren",
        btn_rotate: "🔄 Rotieren",
        btn_revoke: "🗑 Widerrufen",
        rotating_title: "Schloss wird rotiert…",
        rotating_status: "Einladungsschlüssel wird rotiert — 3s",
        rotated_title: "✓ Schloss Rotiert",
        rotated_code: "fnr-7w2z-q5t1",
        rotated_line: "Alte Einladung ungültig. Neue bereit.",
        btn_copy_new: "📋 Neue Einladung Kopieren",
        btn_back: "← Zurück",
        revoke_confirm:
            "Dieses Schloss widerrufen? Die Einladung wird dauerhaft ungültig.",
        revoke_yes: "Ja, widerrufen",
        revoke_cancel: "Abbrechen",
        revoked_title: "🔴 Widerrufen",
        revoked_line:
            "Schloss für <code>example.com</code> wurde widerrufen.",
        my_locks_title: "Deine Schlösser",
        my_locks_empty: "Keine aktiven Schlösser.",
        my_locks_item: "<code>example.com</code> — fnr-8x4m…",
        my_locks_count: "1 aktives Schloss",
        copied: "✓ Kopiert!",
        error_generic: "Etwas ist schiefgelaufen. Versuche es erneut.",
        error_invalid_domain: "Das sieht nicht wie eine gültige Domain aus.",
        lock_not_found: "Schloss nicht gefunden.",
    },
};

/** Translate a key into the given locale, falling back to English */
export function t(locale: Locale, key: string): string {
    return L[locale]?.[key] ?? L.en[key] ?? `{${key}}`;
}

/** Locale labels for display */
export const LOCALE_LABELS: Record<Locale, string> = {
    en: "🇬🇧 EN",
    es: "🇪🇸 ES",
    fr: "🇫🇷 FR",
    de: "🇩🇪 DE",
};
