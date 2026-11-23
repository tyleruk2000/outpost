/**
 * Tasks: the background jobs that are not downloads, as the Downloads and tasks screen
 * shows them. What each kind of job is called in plain words, what it counts, and which
 * of pause, resume, cancel and retry make sense for it; and the shape of one job's
 * details (`GET /api/jobs/:id/detail`).
 */
import type { JobDto, JobState } from "./common.ts";

/** The job type every download runs as. Downloads have their own part of the screen and their own page. */
export const DOWNLOAD_JOB_TYPE = "download.run";

/** Where a person started this kind of work, to start it again or look at what it made. */
export interface TaskPlace {
  to: string;
  label: string;
}

export interface TaskKind {
  /** What it is, as a person would say it: "Reading a document". Sentence case, no full stop. */
  name: string;
  /** One line on what it does. Ends with a full stop. */
  about: string;
  /** What its progress counts, when the job does not say: "bytes", "passages", "pages". */
  unit?: string;
  /**
   * Whether it can be paused. "resumes": it carries on from where it stopped; "restarts":
   * it starts again from the beginning when resumed. Absent: it cannot be paused.
   */
  pause?: "resumes" | "restarts";
  /** False when stopping it part of the way would leave things worse than letting it finish. */
  cancel?: boolean;
  /** True when a failed one can simply be run again from here. */
  retry?: boolean;
  /** Where it is started from. */
  from?: TaskPlace;
}

/**
 * Every job type the server registers, in words. `apps/server/test/tasks.test.ts` fails
 * when a type is registered without an entry here.
 */
export const TASK_KINDS: Record<string, TaskKind> = {
  "audiobook.add": {
    name: "Adding an audiobook",
    about: "Unpacks the chapters of an audiobook and files them in the library.",
    from: { to: "/library", label: "Open the library" },
  },
  "backup.run": {
    name: "Making a backup",
    about: "Writes the database, attachments and text to a backup file.",
    from: { to: "/settings#backup", label: "Open Backup in Settings" },
  },
  "backup.test-restore": {
    name: "Testing a restore",
    about: "Opens a backup file on the side and checks that everything in it can be read back.",
    from: { to: "/settings#backup", label: "Open Backup in Settings" },
  },
  "calibre.import": {
    name: "Bringing in a Calibre library",
    about: "Copies the chosen books from a Calibre library into Outpost's library.",
    unit: "books",
    from: { to: "/library/calibre", label: "Open Import from Calibre" },
  },
  "calibre.read": {
    name: "Reading a Calibre library",
    about: "Reads the list of books in a Calibre library, so you can choose what to bring in.",
    unit: "books",
    from: { to: "/library/calibre", label: "Open Import from Calibre" },
  },
  "collection.move": {
    name: "Moving a collection",
    about: "Copies a collection to another storage location, checks every byte, then removes the old copy.",
    unit: "bytes",
    from: { to: "/storage", label: "Open Storage" },
  },
  "collection.verify": {
    name: "Checking a collection",
    about: "Reads a collection's files back and compares them with their checksums.",
    unit: "bytes",
    pause: "restarts",
    retry: true,
    from: { to: "/storage", label: "Open Storage" },
  },
  "database.check": {
    name: "Checking the database",
    about: "Reads every page of the database to make sure nothing in it is damaged.",
    retry: true,
    from: { to: "/storage", label: "Open Storage" },
  },
  "database.vacuum": {
    name: "Reclaiming space in the database",
    about: "Rewrites the database without its unused pages. Other work waits until it has finished.",
    cancel: false,
    from: { to: "/storage", label: "Open Storage" },
  },
  "document.extract": {
    name: "Reading a document",
    about: "Takes the text out of a document so that it can be searched and quoted.",
    cancel: false,
    from: { to: "/library", label: "Open the library" },
  },
  "document.ocr": {
    name: "Reading scanned pages",
    about: "Recognises the words on pages that are pictures of text (OCR), a page at a time.",
    unit: "pages",
    pause: "resumes",
    retry: true,
    from: { to: "/library", label: "Open the library" },
  },
  "documents.move": {
    name: "Moving documents",
    about: "Copies documents to another storage location and checks them before removing the old copies.",
    from: { to: "/storage/manage", label: "Open Manage and clean up" },
  },
  "download.run": {
    name: "Downloading",
    about: "Fetches a file from its source, checks it and installs it.",
    unit: "bytes",
    from: { to: "/downloads", label: "Open Downloads and tasks" },
  },
  "export-all.run": {
    name: "Taking everything out",
    about: "Writes what you chose of your notes, contacts, logs and settings to one file to keep or take elsewhere.",
    unit: "parts",
    from: { to: "/settings#export", label: "Open Take everything out in Settings" },
  },
  "import.analyse": {
    name: "Looking through an import",
    about: "Reads the files you chose to import and works out what they hold, before anything is added.",
    from: { to: "/import", label: "Open Import" },
  },
  "import.commit": {
    name: "Importing",
    about: "Adds what an import holds to Notes and the library.",
    unit: "steps",
    from: { to: "/import", label: "Open Import" },
  },
  "kiwix.add-files": {
    name: "Adding a collection's files to the library",
    about: "Copies the files of a reference collection into the library, one after another, and has each one read.",
    unit: "files",
    pause: "resumes",
    retry: true,
    from: { to: "/library?tab=collections", label: "Open your collections" },
  },
  "layers.import": {
    name: "Importing reference data for the map",
    about: "Reads a file of places or areas and makes it a layer you can show on the map.",
    from: { to: "/maps?reference=manage", label: "Open reference data for the map" },
  },
  "manage.derived": {
    name: "Clearing and rebuilding search data",
    about: "Removes search data made from your library and builds it again.",
    unit: "steps",
    from: { to: "/storage/manage", label: "Open Manage and clean up" },
  },
  "manage.erase": {
    name: "Erasing everything",
    about: "Removes everything Outpost holds, as asked for under Manage and clean up.",
    cancel: false,
    from: { to: "/storage/manage", label: "Open Manage and clean up" },
  },
  "manage.remove": {
    name: "Removing from the library",
    about: "Removes the chosen collections, documents and maps, and their files where that was asked for.",
    unit: "items",
    from: { to: "/storage/manage", label: "Open Manage and clean up" },
  },
  "merge.analyse": {
    name: "Looking for changes on a portable drive",
    about: "Compares what was written on a portable drive with what is here, before anything is brought back.",
    from: { to: "/storage/merge", label: "Open Bring back changes from a drive" },
  },
  "merge.apply": {
    name: "Bringing back changes from a portable drive",
    about: "Copies the notes, pages and collections chosen from a portable drive into this Outpost.",
    unit: "items",
    from: { to: "/storage/merge", label: "Open Bring back changes from a drive" },
  },
  "network.makers": {
    name: "Fetching the list of device makers",
    about: "Downloads the IEEE's registry of who makes which network devices, to name what is found on the network.",
    unit: "bytes",
    retry: true,
    from: { to: "/tools/network", label: "Open Devices on this network" },
  },
  "network.scan": {
    name: "Looking for devices on the network",
    about: "Asks each address on this network whether anything answers, and what it is.",
    from: { to: "/tools/network", label: "Open Devices on this network" },
  },
  "portable.build": {
    name: "Writing a portable drive",
    about: "Copies Outpost, its programs and the chosen library onto a drive that runs on another computer.",
    unit: "bytes",
    from: { to: "/storage", label: "Open Storage" },
  },
  "portable.runtimes": {
    name: "Fetching programs for portable drives",
    about: "Downloads the programs a portable drive needs to run on each kind of computer, and keeps them for next time.",
    from: { to: "/storage", label: "Open Storage" },
  },
  "propagation.adif-import": {
    name: "Reading a contact log",
    about: "Reads an ADIF file of radio contacts into the record of what was heard and worked.",
    from: { to: "/radio/log", label: "Open the contact log" },
  },
  "propagation.coverage": {
    name: "Working out radio coverage",
    about: "Asks the propagation engine about each cell of a map, to show where a signal should reach.",
    unit: "cells",
    from: { to: "/radio/coverage", label: "Open HF coverage" },
  },
  "propagation.p533-build": {
    name: "Building the P.533 engine",
    about: "Builds the ITU's P.533 HF propagation program on this machine from its published source.",
    retry: true,
    from: { to: "/radio/propagation", label: "Open HF propagation" },
  },
  "propagation.predict": {
    name: "Predicting HF propagation",
    about: "Works out which frequencies should carry between two places through the day.",
    from: { to: "/radio/propagation", label: "Open HF propagation" },
  },
  "roads.build": {
    name: "Building a road network",
    about: "Reads the main roads out of an OpenStreetMap extract and makes the network road directions are planned on.",
    pause: "restarts",
    retry: true,
    from: { to: "/maps", label: "Open Maps" },
  },
  "semantic.index": {
    name: "Building search by meaning",
    about: "Turns each passage of the library into numbers that say what it means, so search can find it by meaning.",
    unit: "passages",
    pause: "resumes",
    retry: true,
    from: { to: "/settings#semantic", label: "Open Search by meaning in Settings" },
  },
  "update.apply": {
    name: "Installing an update",
    about: "Puts a new version of Outpost in place and restarts it.",
    cancel: false,
    from: { to: "/settings#updates", label: "Open Updates in Settings" },
  },
  "update.prepare": {
    name: "Preparing an update",
    about: "Checks and unpacks a new version of Outpost, ready to install.",
    from: { to: "/settings#updates", label: "Open Updates in Settings" },
  },
  "webpage.save": {
    name: "Saving a web page",
    about: "Fetches a web page and keeps a copy of it in the library that loads nothing from the web.",
    from: { to: "/library", label: "Open the library" },
  },
};

/** A kind of job no entry describes, said plainly rather than by its code name. */
export const UNKNOWN_TASK: TaskKind = { name: "Background work", about: "Work Outpost is doing on the server." };

export function taskKind(type: string): TaskKind {
  return TASK_KINDS[type] ?? UNKNOWN_TASK;
}

/** Where a job's progress stood at one moment while it ran. */
export interface JobSample {
  at: number;
  current: number;
  total: number | null;
  unit: string | null;
}

export type JobEventKind = "state" | "retry" | "stage" | "resumed" | "restarted";

/** One step in a job's history. */
export interface JobEvent {
  at: number;
  kind: JobEventKind;
  state: JobState;
  /** The error for a failure or a retry, the stage's name for a stage, otherwise usually nothing. */
  message: string | null;
}

/** Another job, named, as what this one waits behind. */
export interface JobRef {
  id: string;
  type: string;
  title: string;
  state: JobState;
}

/** Why a job that is not running is not running. */
export interface JobWaiting {
  /**
   * "turn": waiting for a free place on its queue; "held": other work has the server to
   * itself for now; "retry": it failed and tries again at `retryAt`; "paused": a person
   * paused it. Null when it is running or has ended.
   */
  reason: "turn" | "held" | "retry" | "paused" | null;
  /** How many of its kind run at once. */
  slots: number;
  /** What is running on its queue now, holding the places it waits for. */
  running: JobRef[];
  /** What is queued before it on the same queue, first first; at most five are named. */
  ahead: JobRef[];
  aheadCount: number;
  /** What the hold is for, in words, when `reason` is "held". */
  held: string | null;
  retryAt: number | null;
}

export interface JobDetail {
  job: JobDto;
  /** Oldest first. At most a couple of hundred, spread over the whole run. */
  samples: JobSample[];
  /** Oldest first. */
  events: JobEvent[];
  waiting: JobWaiting;
}

export interface JobsResponse {
  jobs: JobDto[];
}
