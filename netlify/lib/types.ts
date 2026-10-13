// Shared shapes for the Netlify functions (classic handler style: event in, response out).
export interface FnEvent {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}
export interface FnResponse { statusCode: number; headers?: Record<string, string>; body: string; }
export type Handler = (event: FnEvent) => Promise<FnResponse>;
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Env = Record<string, string | undefined>;
