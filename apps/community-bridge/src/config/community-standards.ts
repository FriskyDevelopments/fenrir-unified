/**
 * Normas de contenido que el operador de una comunidad acepta al crear su gate.
 *
 * Esto NO es copy de marketing: es la regla que después ejecutan las capas de
 * moderación (ver README, "Trust & safety"). La política es deliberadamente
 * asimétrica —desnudez adulta permitida, menores nunca— porque el control real
 * es la EDAD APARENTE, no la desnudez.
 *
 * Cuatro idiomas, los mismos que soporta image-guard: en · es · fr · de.
 */

export const STANDARDS_LOCALES = ["en", "es", "fr", "de"] as const;
export type StandardsLocale = (typeof STANDARDS_LOCALES)[number];

export interface StandardsRule {
  /** Marca visual: "allow" en verde, "ban" en rojo, "duty" en ámbar. */
  tone: "allow" | "ban" | "duty";
  title: string;
  body: string;
}

export interface StandardsCopy {
  eyebrow: string;
  title: string;
  intro: string;
  rules: StandardsRule[];
  /** Texto del checkbox de aceptación. */
  acknowledge: string;
  continueLabel: string;
  /** Aviso legal breve bajo el checkbox. */
  legalNote: string;
}

export const COMMUNITY_STANDARDS: Record<StandardsLocale, StandardsCopy> = {
  en: {
    eyebrow: "Before you open the door",
    title: "Community standards",
    intro:
      "You are about to run a gate people walk through. These rules apply to every gate on MyFenrir, and they are enforced automatically.",
    rules: [
      {
        tone: "allow",
        title: "Adult sexual content is welcome",
        body: "This is an adult space and explicit content between consenting adults is exactly what it is for. The rules below are about age and consent — never about who your community is.",
      },
      {
        tone: "ban",
        title: "Everyone shown must have agreed to be shown",
        body: "Intimate images published without the consent of the people in them are banned, and removal on report is a legal duty with a tight deadline. Leaks and revenge posts get the gate closed.",
      },
      {
        tone: "ban",
        title: "Minors are never allowed — no exceptions",
        body: "Any sexual or suggestive content involving someone who appears to be a minor is banned outright. This is not a judgement call about intent: apparent age is what counts, and the check is automatic.",
      },
      {
        tone: "ban",
        title: "Child sexual abuse material means an immediate ban",
        body: "Uploads are matched against the hash lists of child-protection organisations. A match closes the gate, preserves the evidence, and is reported to the authorities. There is no appeal and no warning.",
      },
      {
        tone: "ban",
        title: "No usernames that advertise it either",
        body: "Coded terms in a display name or handle are treated exactly like the image. The name is scanned too.",
      },
      {
        tone: "duty",
        title: "If you host explicit content, you keep the records",
        body: "Hosting sexually explicit material can legally require you to keep proof of age and identity for everyone who appears in it. The obligation is yours, not the platform's. Get legal advice before you publish.",
      },
    ],
    acknowledge: "I have read these standards and I accept them for my community.",
    continueLabel: "Accept and continue",
    legalNote:
      "Confirmed detections are preserved and reported as the law requires. Deleting the content does not satisfy that duty.",
  },

  es: {
    eyebrow: "Antes de abrir la puerta",
    title: "Normas de la comunidad",
    intro:
      "Vas a operar una puerta por la que entra gente. Estas reglas aplican a todos los gates de MyFenrir y se hacen cumplir de forma automática.",
    rules: [
      {
        tone: "allow",
        title: "El contenido sexual adulto es bienvenido",
        body: "Este es un espacio para adultos y el contenido explícito entre adultos que consienten es justamente para lo que existe. Las reglas de abajo son sobre edad y consentimiento — nunca sobre quién es tu comunidad.",
      },
      {
        tone: "ban",
        title: "Quien aparece tuvo que aceptar aparecer",
        body: "Publicar imágenes íntimas sin el consentimiento de quienes salen en ellas está prohibido, y retirarlas al recibir un reporte es una obligación legal con plazo corto. Filtraciones y venganzas cierran el gate.",
      },
      {
        tone: "ban",
        title: "Menores nunca — sin excepciones",
        body: "Cualquier contenido sexual o sugerente con alguien que aparente ser menor de edad queda prohibido de raíz. No se evalúa la intención: lo que cuenta es la edad aparente, y la revisión es automática.",
      },
      {
        tone: "ban",
        title: "Material de abuso sexual infantil = baneo inmediato",
        body: "Lo que se sube se compara contra las listas de hashes de organizaciones de protección infantil. Una coincidencia cierra el gate, preserva la evidencia y se reporta a las autoridades. Sin apelación y sin aviso.",
      },
      {
        tone: "ban",
        title: "Tampoco nombres de usuario que lo anuncien",
        body: "Los términos codificados en un nombre visible o en un alias se tratan igual que la imagen. El nombre también se revisa.",
      },
      {
        tone: "duty",
        title: "Si alojas contenido explícito, los registros son tuyos",
        body: "Alojar material sexualmente explícito puede obligarte legalmente a conservar prueba de edad e identidad de todas las personas que aparecen. La obligación es tuya, no de la plataforma. Consulta a un abogado antes de publicar.",
      },
    ],
    acknowledge: "He leído estas normas y las acepto para mi comunidad.",
    continueLabel: "Aceptar y continuar",
    legalNote:
      "Las detecciones confirmadas se preservan y se reportan según exige la ley. Borrar el contenido no cumple con ese deber.",
  },

  fr: {
    eyebrow: "Avant d'ouvrir la porte",
    title: "Règles de la communauté",
    intro:
      "Vous allez gérer une porte par laquelle des personnes entrent. Ces règles s'appliquent à tous les gates MyFenrir et sont appliquées automatiquement.",
    rules: [
      {
        tone: "allow",
        title: "Le contenu sexuel adulte est le bienvenu",
        body: "C'est un espace pour adultes, et le contenu explicite entre adultes consentants est précisément sa raison d'être. Les règles ci-dessous portent sur l'âge et le consentement — jamais sur l'identité de votre communauté.",
      },
      {
        tone: "ban",
        title: "Toute personne montrée doit avoir accepté de l'être",
        body: "Publier des images intimes sans le consentement des personnes concernées est interdit, et les retirer dès signalement est une obligation légale à délai court. Fuites et vengeances ferment le gate.",
      },
      {
        tone: "ban",
        title: "Les mineurs, jamais — sans exception",
        body: "Tout contenu sexuel ou suggestif impliquant une personne qui paraît mineure est interdit sans discussion. L'intention n'entre pas en compte : c'est l'âge apparent qui compte, et le contrôle est automatique.",
      },
      {
        tone: "ban",
        title: "Matériel d'abus sexuel sur mineur = bannissement immédiat",
        body: "Les fichiers envoyés sont comparés aux listes d'empreintes des organismes de protection de l'enfance. Une correspondance ferme le gate, conserve la preuve et est signalée aux autorités. Sans recours ni avertissement.",
      },
      {
        tone: "ban",
        title: "Ni les noms d'utilisateur qui en font la publicité",
        body: "Les termes codés dans un nom affiché ou un pseudo sont traités exactement comme une image. Le nom est analysé lui aussi.",
      },
      {
        tone: "duty",
        title: "Si vous hébergez du contenu explicite, les registres vous incombent",
        body: "Héberger du contenu sexuellement explicite peut légalement vous obliger à conserver une preuve d'âge et d'identité pour chaque personne qui y figure. L'obligation est la vôtre, pas celle de la plateforme. Consultez un avocat avant de publier.",
      },
    ],
    acknowledge: "J'ai lu ces règles et je les accepte pour ma communauté.",
    continueLabel: "Accepter et continuer",
    legalNote:
      "Les détections confirmées sont conservées et signalées comme la loi l'exige. Supprimer le contenu ne remplit pas cette obligation.",
  },

  de: {
    eyebrow: "Bevor du die Tür öffnest",
    title: "Community-Regeln",
    intro:
      "Du betreibst gleich eine Tür, durch die Menschen gehen. Diese Regeln gelten für jedes Gate auf MyFenrir und werden automatisch durchgesetzt.",
    rules: [
      {
        tone: "allow",
        title: "Sexuelle Inhalte unter Erwachsenen sind willkommen",
        body: "Das hier ist ein Raum für Erwachsene, und explizite Inhalte zwischen einvernehmlich handelnden Erwachsenen sind genau sein Zweck. Die Regeln unten betreffen Alter und Einvernehmen — nie die Frage, wer deine Community ist.",
      },
      {
        tone: "ban",
        title: "Wer gezeigt wird, muss zugestimmt haben",
        body: "Intime Aufnahmen ohne Einwilligung der abgebildeten Personen sind verboten, und die Entfernung nach Meldung ist eine gesetzliche Pflicht mit kurzer Frist. Leaks und Rachepostings schließen das Gate.",
      },
      {
        tone: "ban",
        title: "Minderjährige niemals — ohne Ausnahme",
        body: "Jeder sexuelle oder anzügliche Inhalt mit einer Person, die minderjährig wirkt, ist grundsätzlich verboten. Die Absicht spielt keine Rolle: Es zählt das scheinbare Alter, und die Prüfung läuft automatisch.",
      },
      {
        tone: "ban",
        title: "Darstellungen sexuellen Kindesmissbrauchs = sofortige Sperre",
        body: "Uploads werden mit den Hash-Listen von Kinderschutzorganisationen abgeglichen. Ein Treffer schließt das Gate, sichert die Beweise und wird den Behörden gemeldet. Ohne Widerspruch und ohne Vorwarnung.",
      },
      {
        tone: "ban",
        title: "Auch keine Benutzernamen, die dafür werben",
        body: "Codierte Begriffe in einem Anzeigenamen oder Handle werden genauso behandelt wie das Bild. Der Name wird ebenfalls geprüft.",
      },
      {
        tone: "duty",
        title: "Wer explizite Inhalte hostet, führt die Nachweise",
        body: "Das Hosten sexuell expliziter Inhalte kann dich rechtlich verpflichten, Alters- und Identitätsnachweise aller abgebildeten Personen aufzubewahren. Die Pflicht liegt bei dir, nicht bei der Plattform. Hol dir vor der Veröffentlichung Rechtsberatung.",
      },
    ],
    acknowledge: "Ich habe diese Regeln gelesen und akzeptiere sie für meine Community.",
    continueLabel: "Akzeptieren und fortfahren",
    legalNote:
      "Bestätigte Funde werden gesichert und wie gesetzlich vorgeschrieben gemeldet. Das Löschen der Inhalte erfüllt diese Pflicht nicht.",
  },
};

/** Idioma del navegador acotado a los soportados; `en` como red de seguridad. */
export function resolveStandardsLocale(input?: string | null): StandardsLocale {
  const tag = (input ?? (typeof navigator !== "undefined" ? navigator.language : "en") ?? "en")
    .toLowerCase()
    .split("-")[0];
  return (STANDARDS_LOCALES as readonly string[]).includes(tag ?? "")
    ? (tag as StandardsLocale)
    : "en";
}

export function getCommunityStandards(locale?: string | null): StandardsCopy {
  return COMMUNITY_STANDARDS[resolveStandardsLocale(locale)];
}
