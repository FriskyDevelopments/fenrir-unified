import type { Brand } from "../brands/types";
import { button, callout, cta, dataTable, h1, p, spacer, steps } from "../components";
import { esc, fecha, firstName, spacedCode } from "../format";
import { layout } from "../layout";
import type { Locale } from "../locale";
import type { RenderedEmail } from "./types";

type L = Exclude<Locale, "es">;
const words = {
  en: { hello: "Hello", panel: "Open my dashboard", sent: "Sent by MyFenrir · myfenrir.com", security: "Security", expires: "Valid for", minutes: "minutes" },
  fr: { hello: "Bonjour", panel: "Ouvrir mon tableau de bord", sent: "Envoyé par MyFenrir · myfenrir.com", security: "Sécurité", expires: "Valable pendant", minutes: "minutes" },
  de: { hello: "Hallo", panel: "Mein Dashboard öffnen", sent: "Gesendet von MyFenrir · myfenrir.com", security: "Sicherheit", expires: "Gültig für", minutes: "Minuten" },
} as const;

const copy: Record<L, Record<string, string[]>> = {
  en: {
    "verificacion-codigo": ["Confirm it's you", "Use this code to verify your MyFenrir account. Enter it on the screen where MyFenrir requested it.", "Never share this code. The MyFenrir team will never ask you for it.", "If you didn't start this, ignore this email — your account remains protected.", "Verification", "is your MyFenrir verification code"],
    acceso: ["Sign in with one tap", "Tap the button to enter securely. You don't need a password — this one-time link identifies you.", "Sign in to MyFenrir", "About this link", "It can only be used once.", "If you didn't request it, ignore this email.", "Access", "Your MyFenrir sign-in link"],
    bienvenida: ["Welcome to the pack", "Your MyFenrir account is ready. Fenrir is your identity and key to communities, access and automations in one place.", "Complete your profile", "Give your Fenrir identity a name and face.", "Link your Telegram", "Connect the pack from your dashboard.", "Explore your communities", "Enter the spaces where you belong.", "Welcome", "Welcome to the pack — MyFenrir"],
    "cuenta-vinculada": ["Link confirmed", "Your Telegram is now connected to your Fenrir identity. You can use the pack from the bot and receive seamless access.", "Telegram account", "Username", "MyFenrir identity", "Linked", "Wasn't you?", "Unlink it from your dashboard and contact us immediately.", "Account linked", "Your Telegram is linked to MyFenrir"],
    "activacion-identidad": ["The door is open", "Activate your MyFenrir identity to manage your account, link Telegram and review access in one place.", "Confirm your identity", "Open the secure link in this email.", "Link Telegram", "Select Link Telegram ID in your dashboard.", "Review your access", "The guardian verifies every entry privately.", "Activate my identity", "Private link", "Do not share or forward it.", "Activation", "The door is open — activate your MyFenrir identity"],
    "invitacion-lore": ["Your identity has another layer", "Now you can enter LORE: a separate experience where your choices reveal an Aura, open a story and shape your profile.", "Your Aura is not a label or a promise of a reward. It is the beginning of your story.", "Discover my Aura", "New door", "Your identity has another layer — enter LORE"],
    "continuar-lore": ["Your story is still waiting", "Your progress in LORE is saved. Return exactly where you left off.", "Return to complete the journey, discover your Aura and create your profile.", "Continue my story", "Your story is waiting"],
  },
  fr: {
    "verificacion-codigo": ["Confirmez votre identité", "Utilisez ce code pour vérifier votre compte MyFenrir. Saisissez-le sur l’écran indiqué par MyFenrir.", "Ne partagez jamais ce code. L’équipe MyFenrir ne vous le demandera jamais.", "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — votre compte reste protégé.", "Vérification", "est votre code de vérification MyFenrir"],
    acceso: ["Connectez-vous en un geste", "Touchez le bouton pour vous connecter en toute sécurité. Aucun mot de passe n’est nécessaire.", "Se connecter à MyFenrir", "À propos de ce lien", "Il ne peut être utilisé qu’une seule fois.", "Si vous ne l’avez pas demandé, ignorez cet e-mail.", "Accès", "Votre lien de connexion MyFenrir"],
    bienvenida: ["Bienvenue dans la meute", "Votre compte MyFenrir est prêt. Fenrir réunit votre identité, vos communautés, vos accès et vos automatisations.", "Complétez votre profil", "Donnez un nom et un visage à votre identité Fenrir.", "Liez votre Telegram", "Connectez la meute depuis votre tableau de bord.", "Explorez vos communautés", "Entrez dans les espaces auxquels vous appartenez.", "Bienvenue", "Bienvenue dans la meute — MyFenrir"],
    "cuenta-vinculada": ["Lien confirmé", "Votre Telegram est maintenant lié à votre identité Fenrir. Vous pouvez utiliser la meute depuis le bot.", "Compte Telegram", "Nom d’utilisateur", "Identité MyFenrir", "Lié", "Ce n’était pas vous ?", "Dissociez-le depuis votre tableau de bord et contactez-nous immédiatement.", "Compte lié", "Votre Telegram est lié à MyFenrir"],
    "activacion-identidad": ["La porte est ouverte", "Activez votre identité MyFenrir pour gérer votre compte, lier Telegram et consulter vos accès.", "Confirmez votre identité", "Ouvrez le lien sécurisé de cet e-mail.", "Liez Telegram", "Sélectionnez Link Telegram ID dans votre tableau de bord.", "Consultez vos accès", "Le gardien vérifie chaque entrée en privé.", "Activer mon identité", "Lien privé", "Ne le partagez pas et ne le transférez pas.", "Activation", "La porte est ouverte — activez votre identité MyFenrir"],
    "invitacion-lore": ["Votre identité a une autre dimension", "Entrez dans LORE : une expérience distincte où vos choix révèlent une Aura, ouvrent une histoire et façonnent votre profil.", "Votre Aura n’est ni une étiquette ni une promesse de récompense. C’est le début de votre histoire.", "Découvrir mon Aura", "Nouvelle porte", "Votre identité a une autre dimension — entrez dans LORE"],
    "continuar-lore": ["Votre histoire vous attend", "Votre progression dans LORE est sauvegardée. Reprenez exactement là où vous vous êtes arrêté.", "Revenez terminer le parcours, découvrir votre Aura et créer votre profil.", "Continuer mon histoire", "Votre histoire vous attend"],
  },
  de: {
    "verificacion-codigo": ["Bestätige deine Identität", "Verwende diesen Code, um dein MyFenrir-Konto zu bestätigen. Gib ihn auf der von MyFenrir angezeigten Seite ein.", "Teile diesen Code niemals. Das MyFenrir-Team wird dich nie danach fragen.", "Falls du das nicht gestartet hast, ignoriere diese E-Mail — dein Konto bleibt geschützt.", "Bestätigung", "ist dein MyFenrir-Bestätigungscode"],
    acceso: ["Mit einem Tippen anmelden", "Tippe auf die Schaltfläche, um dich sicher anzumelden. Du brauchst kein Passwort.", "Bei MyFenrir anmelden", "Über diesen Link", "Er kann nur einmal verwendet werden.", "Falls du ihn nicht angefordert hast, ignoriere diese E-Mail.", "Zugang", "Dein MyFenrir-Anmeldelink"],
    bienvenida: ["Willkommen im Rudel", "Dein MyFenrir-Konto ist bereit. Fenrir verbindet Identität, Communities, Zugänge und Automationen an einem Ort.", "Profil vervollständigen", "Gib deiner Fenrir-Identität Namen und Gesicht.", "Telegram verknüpfen", "Verbinde das Rudel über dein Dashboard.", "Communities entdecken", "Betritt die Räume, zu denen du gehörst.", "Willkommen", "Willkommen im Rudel — MyFenrir"],
    "cuenta-vinculada": ["Verknüpfung bestätigt", "Dein Telegram ist jetzt mit deiner Fenrir-Identität verbunden. Du kannst das Rudel über den Bot nutzen.", "Telegram-Konto", "Benutzername", "MyFenrir-Identität", "Verknüpft", "Warst du das nicht?", "Trenne die Verbindung im Dashboard und kontaktiere uns sofort.", "Konto verknüpft", "Dein Telegram ist mit MyFenrir verknüpft"],
    "activacion-identidad": ["Die Tür ist offen", "Aktiviere deine MyFenrir-Identität, um dein Konto zu verwalten, Telegram zu verknüpfen und Zugänge einzusehen.", "Identität bestätigen", "Öffne den sicheren Link in dieser E-Mail.", "Telegram verknüpfen", "Wähle Link Telegram ID in deinem Dashboard.", "Zugänge prüfen", "Der Wächter verifiziert jeden Eintritt privat.", "Meine Identität aktivieren", "Privater Link", "Nicht teilen oder weiterleiten.", "Aktivierung", "Die Tür ist offen — aktiviere deine MyFenrir-Identität"],
    "invitacion-lore": ["Deine Identität hat eine weitere Ebene", "Betritt LORE: eine eigene Erfahrung, in der deine Entscheidungen eine Aura enthüllen, eine Geschichte öffnen und dein Profil formen.", "Deine Aura ist weder Etikett noch Belohnungsversprechen. Sie ist der Anfang deiner Geschichte.", "Meine Aura entdecken", "Neue Tür", "Deine Identität hat eine weitere Ebene — betritt LORE"],
    "continuar-lore": ["Deine Geschichte wartet", "Dein Fortschritt in LORE ist gespeichert. Kehre genau dorthin zurück, wo du aufgehört hast.", "Kehre zurück, beende die Reise, entdecke deine Aura und erstelle dein Profil.", "Meine Geschichte fortsetzen", "Deine Geschichte wartet"],
  },
};

export function renderLocalized(id: string, brand: Brand, d: any, locale: L): RenderedEmail {
  const c = copy[locale][id];
  const w = words[locale];
  const name = d.nombre || firstName(d.email);
  const hello = name ? `${w.hello} <b style="color:${brand.colors.heading}">${esc(name)}</b>, ` : "";
  const url = d.ctaUrl || d.url || (id.includes("lore") ? "https://lore.myfenrir.com/profile/new" : "https://www.myfenrir.com/main");
  const mins = d.minutos ?? 15;
  let subject = c?.at(-1) || d.titulo || "MyFenrir";
  let badge = c?.at(-2) || ({ en: "Notification", fr: "Notification", de: "Benachrichtigung" } as const)[locale];
  let body = "";
  if (id === "notificacion") {
    subject=d.titulo; badge=d.badge||badge; body=`${h1(brand,d.titulo)}${(d.parrafos||[]).map((x:string)=>p(brand,esc(x))).join("")}${d.ctaLabel&&d.ctaUrl?cta(button(brand,d.ctaLabel,d.ctaUrl)):""}`;
  } else if (id === "verificacion-codigo") {
    subject = `${d.codigo} ${c[5]}`; body = `${h1(brand,c[0])}${p(brand,hello+c[1])}${spacer(8)}${callout(brand,{title:`${spacedCode(d.codigo)} · ${w.expires} ${mins} ${w.minutes}`,lines:[c[2],c[3]]})}`;
  } else if (id === "acceso") {
    body = `${h1(brand,c[0])}${p(brand,hello+c[1])}${spacer(10)}${cta(button(brand,c[2],url))}${spacer(18)}${callout(brand,{title:c[3],lines:[`${w.expires} ${mins} ${w.minutes}. ${c[4]}`,c[5]]})}`;
  } else if (id === "bienvenida") {
    subject = name ? `${c[0]}, ${name}` : c[9]; body = `${h1(brand,name?`${c[0]}, ${esc(name)}`:c[0])}${p(brand,c[1])}${steps(brand,[{title:c[2],body:c[3]},{title:c[4],body:c[5]},{title:c[6],body:c[7]}])}${spacer(20)}${cta(button(brand,w.panel,url))}`;
  } else if (id === "cuenta-vinculada") {
    const rows:any[]=[]; if(d.telegramNombre)rows.push({label:c[2],value:d.telegramNombre}); if(d.telegramUsername)rows.push({label:c[3],value:`@${d.telegramUsername}`,mono:true}); if(d.email)rows.push({label:c[4],value:d.email,mono:true}); rows.push({label:c[5],value:fecha(d.fechaISO||new Date(),true,locale)}); body=`${h1(brand,c[0])}${p(brand,hello+c[1])}${dataTable(brand,rows)}${spacer(18)}${callout(brand,{title:c[6],tone:"danger",lines:[c[7]]})}${spacer(18)}${cta(button(brand,w.panel,url))}`;
  } else if (id === "activacion-identidad") {
    body=`${h1(brand,name?`${c[0]}, ${esc(name)}`:c[0])}${p(brand,c[1])}${steps(brand,[{title:c[2],body:c[3]},{title:c[4],body:c[5]},{title:c[6],body:c[7]}])}${spacer(20)}${cta(button(brand,c[8],url))}${callout(brand,{title:c[9],lines:[`${w.expires} ${mins} ${w.minutes}. ${c[10]}`]})}`;
  } else if (id === "invitacion-lore") {
    body=`${h1(brand,c[0])}${p(brand,hello+(d.motivo?esc(d.motivo):""))}${p(brand,c[1])}${callout(brand,{title:"LORE",tone:"purple",lines:[c[2]]})}${spacer(20)}${cta(button(brand,c[3],url,"purple"))}`;
  } else if (id === "continuar-lore") {
    const aura=d.aura?esc(d.aura):""; subject=aura?`${c[3]} — ${aura}`:c[4]; body=`${h1(brand,aura?`${c[3]} — ${aura}`:c[0])}${p(brand,hello+c[1])}${p(brand,aura?`Aura: <b style="color:${brand.colors.purple}">${aura}</b>`:c[2])}${spacer(20)}${cta(button(brand,aura?`${c[3]} — ${aura}`:c[3],url,"purple"))}`;
  }
  const plain = `${subject}\n\n${name ? `${w.hello} ${name},\n\n` : ""}${String(body).replace(/<[^>]+>/g," ").replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim()}\n\n${url}\n\n${w.sent}`;
  return { subject, html: layout({brand,preheader:subject,heroBadge:badge,body,locale}), text: plain };
}
