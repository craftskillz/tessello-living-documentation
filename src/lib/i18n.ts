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
  failed: "Something went wrong. Try again; if it keeps failing, reconnect the folder.",
  detail: "Details: {reason}",
  close: "Close",
  notFound: "This document no longer exists.",
  linkMissing: "The linked document “{path}” does not exist. Fix the link in this document.",
  linkFailed: "The linked document “{path}” could not be opened. Try again; if it keeps failing, reconnect the folder.",
  fileUnavailable: "Opening other files (“{path}”) is not available yet. Open it from your file manager.",
  imageNotFound: "Image not found: {path}. Fix the link or add the image to the folder.",
  trail: "Back to",
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
  failed: "Une erreur est survenue. Réessayez ; si elle persiste, reconnectez le dossier.",
  detail: "Détails : {reason}",
  close: "Fermer",
  notFound: "Ce document n'existe plus.",
  linkMissing: "Le document lié « {path} » n'existe pas. Corrigez le lien dans ce document.",
  linkFailed: "Le document lié « {path} » n'a pas pu être ouvert. Réessayez ; si cela persiste, reconnectez le dossier.",
  fileUnavailable: "L'ouverture des autres fichiers (« {path} ») n'est pas encore disponible. Ouvrez-le depuis votre gestionnaire de fichiers.",
  imageNotFound: "Image introuvable : {path}. Corrigez le lien ou ajoutez l'image au dossier.",
  trail: "Retour vers",
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
