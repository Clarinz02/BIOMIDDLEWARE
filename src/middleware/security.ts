import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { AuthUser, Permission, SystemRole, AuditLog } from '@/types';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
      startTime?: number;
    }
  }
}

// JWT Service
export class JWTService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(secret: string, expiresIn = '24h') {
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  generateToken(payload: Partial<AuthUser>): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token: string): AuthUser {
    try {
      return jwt.verify(token, this.secret) as AuthUser;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  refreshToken(token: string): string {
    const decoded = this.verifyToken(token);
    // Remove JWT specific fields before generating new token
    const { iat, exp, ...payload } = decoded as any;
    return this.generateToken(payload);
  }
}

// Password Service
export class PasswordService {
  private readonly saltRounds: number;

  constructor(saltRounds = 12) {
    this.saltRounds = saltRounds;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

// RBAC Service
export class RBACService {
  private static readonly roleHierarchy: Record<SystemRole, number> = {
    super_admin: 100,
    admin: 80,
    device_manager: 60,
    operator: 40,
    viewer: 20,
  };

  private static readonly defaultPermissions: Record<SystemRole, Permission[]> = {
    super_admin: [
      { resource: '*', action: 'create', scope: 'all' },
      { resource: '*', action: 'read', scope: 'all' },
      { resource: '*', action: 'update', scope: 'all' },
      { resource: '*', action: 'delete', scope: 'all' },
      { resource: '*', action: 'execute', scope: 'all' },
    ],
    admin: [
      { resource: 'devices', action: 'create', scope: 'all' },
      { resource: 'devices', action: 'read', scope: 'all' },
      { resource: 'devices', action: 'update', scope: 'all' },
      { resource: 'devices', action: 'delete', scope: 'all' },
      { resource: 'users', action: 'create', scope: 'branch' },
      { resource: 'users', action: 'read', scope: 'branch' },
      { resource: 'users', action: 'update', scope: 'branch' },
      { resource: 'users', action: 'delete', scope: 'branch' },
      { resource: 'reports', action: 'create', scope: 'branch' },
      { resource: 'reports', action: 'read', scope: 'branch' },
    ],
    device_manager: [
      { resource: 'devices', action: 'read', scope: 'branch' },
      { resource: 'devices', action: 'update', scope: 'branch' },
      { resource: 'devices', action: 'execute', scope: 'branch' },
      { resource: 'users', action: 'create', scope: 'branch' },
      { resource: 'users', action: 'read', scope: 'branch' },
      { resource: 'users', action: 'update', scope: 'branch' },
    ],
    operator: [
      { resource: 'devices', action: 'read', scope: 'branch' },
      { resource: 'users', action: 'read', scope: 'branch' },
      { resource: 'users', action: 'create', scope: 'own' },
      { resource: 'users', action: 'update', scope: 'own' },
      { resource: 'attendance', action: 'read', scope: 'branch' },
    ],
    viewer: [
      { resource: 'devices', action: 'read', scope: 'branch' },
      { resource: 'users', action: 'read', scope: 'own' },
      { resource: 'attendance', action: 'read', scope: 'own' },
      { resource: 'reports', action: 'read', scope: 'own' },
    ],
  };

  static hasPermission(
    user: AuthUser,
    requiredResource: string,
    requiredAction: string,
    requiredScope: string = 'all'
  ): boolean {
    // Super admin has all permissions
    if (user.role === 'super_admin') {
      return true;
    }

    // Check explicit permissions
    const hasExplicitPermission = user.permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === requiredResource;
      const actionMatch = permission.action === requiredAction;
      const scopeMatch = this.checkScope(permission.scope || 'all', requiredScope);
      
      return resourceMatch && actionMatch && scopeMatch;
    });

    if (hasExplicitPermission) {
      return true;
    }

    // Check default role permissions
    const defaultPerms = this.defaultPermissions[user.role] || [];
    return defaultPerms.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === requiredResource;
      const actionMatch = permission.action === requiredAction;
      const scopeMatch = this.checkScope(permission.scope || 'all', requiredScope);
      
      return resourceMatch && actionMatch && scopeMatch;
    });
  }

  private static checkScope(userScope: string, requiredScope: string): boolean {
    const scopeHierarchy = { all: 3, branch: 2, own: 1 };
    return (scopeHierarchy[userScope as keyof typeof scopeHierarchy] || 0) >= 
           (scopeHierarchy[requiredScope as keyof typeof scopeHierarchy] || 0);
  }

  static hasRole(user: AuthUser, requiredRole: SystemRole): boolean {
    return this.roleHierarchy[user.role] >= this.roleHierarchy[requiredRole];
  }
}

// Audit Logger Service
export class AuditLoggerService {
  private static instance: AuditLoggerService;
  private logs: AuditLog[] = []; // In production, use database

  static getInstance(): AuditLoggerService {
    if (!this.instance) {
      this.instance = new AuditLoggerService();
    }
    return this.instance;
  }

  async logAction(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const auditLog: AuditLog = {
      ...log,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    this.logs.push(auditLog);

    // In production, save to database
    console.log('[AUDIT]', auditLog);
  }

  async getLogs(
    userId?: string,
    resource?: string,
    limit = 100
  ): Promise<AuditLog[]> {
    let filteredLogs = this.logs;

    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === userId);
    }

    if (resource) {
      filteredLogs = filteredLogs.filter(log => log.resource === resource);
    }

    return filteredLogs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Security Middleware
export const securityMiddleware = {
  // Helmet for basic security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),

  // Rate limiting
  rateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),

  // Strict rate limiting for auth endpoints
  authRateLimiter: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
    },
  }),

  // Request ID generator
  requestId: (req: Request, res: Response, next: NextFunction): void => {
    req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.startTime = Date.now();
    res.setHeader('X-Request-ID', req.requestId);
    next();
  },

  // JWT Authentication
  authenticate: (jwtService: JWTService) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : req.query.token as string;

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication token required',
        });
        return;
      }

      try {
        const user = jwtService.verifyToken(token);
        req.user = user;
        next();
      } catch (error) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }
    };
  },

  // RBAC Authorization
  authorize: (resource: string, action: string, scope = 'all') => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const hasPermission = RBACService.hasPermission(
        req.user,
        resource,
        action,
        scope
      );

      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
        });
        return;
      }

      next();
    };
  },

  // Role-based authorization
  requireRole: (requiredRole: SystemRole) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const hasRole = RBACService.hasRole(req.user, requiredRole);

      if (!hasRole) {
        res.status(403).json({
          success: false,
          error: `Role '${requiredRole}' or higher required`,
        });
        return;
      }

      next();
    };
  },

  // Audit logging middleware
  auditLogger: (action: string, resource: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const originalSend = res.send;
      let responseBody: any;

      // Capture response
      res.send = function (body: any) {
        responseBody = body;
        return originalSend.call(this, body);
      };

      // Store original next to call it later
      const originalNext = next;

      // Override next to capture success/failure
      next = async (error?: any) => {
        const auditLogger = AuditLoggerService.getInstance();
        
        await auditLogger.logAction({
          userId: req.user?.id || 'anonymous',
          action,
          resource,
          resourceId: req.params.id || req.params.deviceId,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            body: this.sanitizeBody(req.body),
            responseStatus: res.statusCode,
            requestId: req.requestId,
            duration: req.startTime ? Date.now() - req.startTime : 0,
          },
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          success: !error && res.statusCode < 400,
          deviceId: req.params.deviceId || req.body.deviceId,
        });

        originalNext(error);
      };

      next();
    };
  },

  // Helper method to sanitize request body for logging
  sanitizeBody: (body: any): any => {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'key'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  },
};

// Input validation middleware
export const validateInput = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body);
    
    if (error) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }

    req.body = value;
    next();
  };
};

// Error handling middleware
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('[ERROR]', {
    requestId: req.requestId,
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (error.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: isDevelopment ? error.details : undefined,
    });
  } else if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  } else if (error.name === 'ForbiddenError') {
    res.status(403).json({
      success: false,
      error: 'Access denied',
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      requestId: req.requestId,
      details: isDevelopment ? error.message : undefined,
    });
  }
};

export { JWTService, PasswordService, RBACService, AuditLoggerService };
