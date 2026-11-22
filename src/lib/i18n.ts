// The English and French catalogs of Living Documentation. The language follows the Host's `locale`; English otherwise.

const en = {
  title: "Living Documentation",
  intro: "Keep your documentation as Markdown files in your project, where your coding agents can read them too.",
  connect: "Connect a folder",
  connectHint: "Choose your documentation folder, for example your repository's docs/.",
  documents: "Documents",
  emptyProject: "This folder holds no Markdown document yet.",
  unavailable: "{name} is unavailable",
  unavailableText: "Your browser asks you to allow this folder again after a restart.",
  reconnect: "Reconnect",
  edit: "Edit",
  done: "Done",
  markdown: "Markdown",
  saving: "Saving…",
  saved: "Saved",
  changedOutside: "This document changed outside Living Documentation while you were editing it.",
  deletedOutside: "This document was deleted outside Living Documentation while you were editing it.",
  compare: "Compare",
  keepMine: "Keep mine",
  takeTheirs: "Take theirs",
  mine: "Mine",
  theirs: "On disk",
  failed: "Something went wrong: {reason}",
  notFound: "This document no longer exists.",
};

type Messages = typeof en;

const fr: Messages = {
  title: "Living Documentation",
  intro: "Gardez votre documentation en fichiers Markdown dans votre projet, où vos agents de code peuvent aussi la lire.",
  connect: "Connecter un dossier",
  connectHint: "Choisissez votre dossier de documentation, par exemple le docs/ de votre dépôt.",
  documents: "Documents",
  emptyProject: "Ce dossier ne contient encore aucun document Markdown.",
  unavailable: "{name} est indisponible",
  unavailableText: "Après un redémarrage, votre navigateur vous demande d'autoriser ce dossier à nouveau.",
  reconnect: "Reconnecter",
  edit: "Modifier",
  done: "Terminé",
  markdown: "Markdown",
  saving: "Enregistrement…",
  saved: "Enregistré",
  changedOutside: "Ce document a été modifié hors de Living Documentation pendant que vous le modifiiez.",
  deletedOutside: "Ce document a été supprimé hors de Living Documentation pendant que vous le modifiiez.",
  compare: "Comparer",
  keepMine: "Garder le mien",
  takeTheirs: "Prendre le leur",
  mine: "Le mien",
  theirs: "Sur le disque",
  failed: "Une erreur est survenue : {reason}",
  notFound: "Ce document n'existe plus.",
};

export type MessageKey = keyof Messages;

let messages: Messages = en;

/** Chooses the catalog for a BCP 47 tag, such as "fr-FR"; English for any other language. */
export function setLocale(locale: string): void {
  messages = locale.toLowerCase().split("-")[0] === "fr" ? fr : en;
}

/** The message in the current language, with each `{name}` replaced by its value. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
