import { NextFunction, Request, Response } from 'express';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  void _next;
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal server error' });
};
