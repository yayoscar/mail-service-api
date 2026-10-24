export interface System {
  id: string;
  key: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedSystem extends System {
  apiKey: string;
}

export interface RegeneratedApiKey {
  message: string;
  apiKey: string;
  systemId: string;
}

export interface Mailbox {
  id: string;
  systemId: string;
  email: string;
  displayName: string;
  isDefault: boolean;
  active: boolean;
  consentGiven: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentLink {
  url: string;
  expiresAt: string;
}
