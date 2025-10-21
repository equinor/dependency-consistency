export type SupportedLanguages = 'node' | 'python';

export interface Hook {
	id: string;
	additional_dependencies: string[];
	language: SupportedLanguages;
	language_version?: string;
}

export interface Repo {
	repo: string;
	rev: string;
	hooks: Hook[];
}

export interface PreCommit {
	repos: Repo[];
}

export type ChangeYaml<T> = (root: T) => void;
