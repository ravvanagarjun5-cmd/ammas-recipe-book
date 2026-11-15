// Types shared by the server and the web app.

export interface Ingredient {
  item: string;
  /** Exactly as spoken: "two", "a little", "one handful". Null when not mentioned. */
  quantity: string | null;
  note: string | null;
}

export interface Confirmation {
  about: string;
  question: string;
}

/** What the AI (or Mom, by hand) fills in. Everything is optional except that a saved recipe needs a title. */
export interface RecipeDraft {
  title: string | null;
  collection_hint: string | null;
  story: string | null;
  ingredients: Ingredient[];
  steps: string[];
  notes: string | null;
  variation_note: string | null;
  servings: string | null;
  time: string | null;
  tags: string[];
  needs_confirmation: Confirmation[];
}

export type RecordingStatus =
  | 'uploaded'
  | 'transcribing'
  | 'structuring'
  | 'ready' // draft available for review
  | 'failed_transcribe'
  | 'failed_structure'
  | 'saved';

export interface Recording {
  id: string;
  status: RecordingStatus;
  duration_ms: number;
  /** What the speech-to-text service heard. Never overwritten. Part of the family record. */
  transcript: string | null;
  /** The family's corrections to those words, if any. The recipe is written from this when present. */
  transcript_edited: string | null;
  stt_provider: string | null;
  draft: RecipeDraft | null;
  /** Friendly, safe-to-show message for the current failure, if any. */
  error: string | null;
  recipe_id: string | null;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
}

export interface Recipe {
  id: string;
  title: string;
  collection_id: string | null;
  collection_name: string | null;
  story: string | null;
  ingredients: Ingredient[];
  steps: string[];
  notes: string | null;
  variation_note: string | null;
  servings: string | null;
  time: string | null;
  tags: string[];
  based_on_id: string | null;
  based_on_title: string | null;
  recording_id: string | null;
  /** The words she spoke, typed out by the phone. Editable; the voice recording stays as the original. */
  transcript?: string | null;
  created_at: string;
  updated_at: string;
}

/** What the editor sends when saving. */
export interface RecipeInput {
  title: string;
  collection_id: string | null;
  story: string | null;
  ingredients: Ingredient[];
  steps: string[];
  notes: string | null;
  variation_note: string | null;
  servings: string | null;
  time: string | null;
  tags: string[];
  based_on_id: string | null;
  recording_id: string | null;
  transcript?: string | null;
}

export interface AppConfig {
  appName: string;
  /** True when speech or AI adapters are simulated. The UI must say so. */
  devMode: boolean;
  devNotes: string[];
}
