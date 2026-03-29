import { Response } from 'express';

interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: string | null;
  details?: any;
}

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    error: null,
  };
  res.status(statusCode).json(response);
}

export function sendError(res: Response, error: string, statusCode: number = 500, details?: any): void {
  const response: ApiResponse = {
    success: false,
    data: null,
    error,
    ...(details && { details }),
  };
  res.status(statusCode).json(response);
}

export function sendValidationError(res: Response, errors: Array<{ field: string; message: string }>): void {
  const response: ApiResponse = {
    success: false,
    data: null,
    error: 'Validation failed',
    details: errors,
  };
  res.status(400).json(response);
}
