export class ApiError extends Error {
  constructor(
    public code: 'offline' | 'unauthorized' | 'validation' | 'server',
    message: string,
    /** The backend's own error code when it sends one, e.g. TWO_STEP_NOT_SUPPORTED */
    public reason?: string,
  ) {
    super(message);
  }
}
