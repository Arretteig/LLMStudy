// Typed domain errors thrown by repos (and validators) so the central error
// middleware in app.ts can map them to HTTP status codes. Routers stay thin:
// call the repo, let a thrown error propagate (handlers are synchronous, so
// Express forwards throws to the middleware automatically).

/** A referenced row does not exist. Mapped to HTTP 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Client input is malformed or fails a business rule. Mapped to HTTP 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** The request conflicts with current state (e.g. undoing a non-latest attempt). Mapped to HTTP 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
