/**
 * Core Types Test
 * 
 * This file tests the core type definitions and conversion utilities.
 */

import { describe, test, expect } from 'vitest';
import { toChatMessage, isChatMessage, ChatMessage } from '../Message';
import { toChatConversation, isChatConversation, ChatConversation } from '../Conversation';
import { AppError, ErrorCode, handleError, safeExecute } from '../../../utils/core/errorHandling';

describe('Core Types', () => {
  describe('Message Types', () => {
    test('toChatMessage converts legacy message format', () => {
      const legacyMessage = {
        id: '123',
        role: 'user' as const,
        content: 'Hello',
        created_at: '2024-01-01T00:00:00Z',
        metadata: { test: true },
      };
      
      console.log('Legacy message:', legacyMessage);
      const converted = toChatMessage(legacyMessage);
      console.log('Converted message:', converted);
      
      expect(converted.id).toBe('123');
      expect(converted.role).toBe('user');
      expect(converted.content).toBe('Hello');
      expect(converted.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(converted.metadata).toEqual({ test: true });
      expect(isChatMessage(converted)).toBe(true);
    });
    
    test('toChatMessage handles missing fields', () => {
      const minimalMessage = {
        role: 'assistant' as const,
        content: 'Hi there',
      };
      
      const converted = toChatMessage(minimalMessage);
      
      expect(converted.id).toBeDefined();
      expect(converted.role).toBe('assistant');
      expect(converted.content).toBe('Hi there');
      expect(converted.createdAt).toBeDefined();
      expect(isChatMessage(converted)).toBe(true);
    });
    
    test('isChatMessage correctly identifies chat messages', () => {
      const validMessage: ChatMessage = {
        id: '123',
        role: 'user',
        content: 'Hello',
        createdAt: '2024-01-01T00:00:00Z',
      };
      
      const invalidMessage = {
        id: '123',
        content: 'Hello', // Missing role
      };
      
      const legacyMessage = {
        id: '123',
        role: 'user',
        content: 'Hello',
        created_at: '2024-01-01T00:00:00Z', // Wrong field name
      };
      
      expect(isChatMessage(validMessage)).toBe(true);
      expect(isChatMessage(invalidMessage)).toBe(false);
      expect(isChatMessage(legacyMessage)).toBe(false);
      expect(isChatMessage(null)).toBe(false);
      expect(isChatMessage(undefined)).toBe(false);
    });
  });
  
  describe('Conversation Types', () => {
    test('toChatConversation converts legacy conversation format', () => {
      const legacyConversation = {
        id: 'conv_123',
        title: 'Test Conversation',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
        messages: [
          { id: 'msg1', role: 'user' as const, content: 'Hello', created_at: '2024-01-01T00:00:00Z' },
          { id: 'msg2', role: 'assistant' as const, content: 'Hi', created_at: '2024-01-01T00:01:00Z' },
        ],
        is_backend_confirmed: true,
        is_title_generating: false,
        preview: 'Hello...',
        message_count: 2,
        pinned: true,
        folder: 'test',
      };
      
      console.log('Input conversation:', legacyConversation);
      const converted = toChatConversation(legacyConversation);
      console.log('Converted conversation:', converted);
      console.log('isTitleGenerating:', converted.isTitleGenerating);
      
      expect(converted.id).toBe('conv_123');
      expect(converted.title).toBe('Test Conversation');
      expect(converted.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(converted.updatedAt).toBe('2024-01-01T01:00:00Z');
      expect(converted.messages).toHaveLength(2);
      expect(converted.isBackendConfirmed).toBe(true);
      expect(converted.isTitleGenerating).toBe(false);
      expect(converted.preview).toBe('Hello...');
      expect(converted.messageCount).toBe(2);
      expect(converted.pinned).toBe(true);
      expect(converted.folder).toBe('test');
      expect(isChatConversation(converted)).toBe(true);
    });
    
    test('toChatConversation handles missing fields', () => {
      const minimalConversation = {
        id: 'conv_123',
        title: 'Test',
      };
      
      const converted = toChatConversation(minimalConversation);
      
      expect(converted.id).toBe('conv_123');
      expect(converted.title).toBe('Test');
      expect(converted.createdAt).toBeDefined();
      expect(converted.updatedAt).toBeDefined();
      expect(converted.messages).toEqual([]);
      expect(isChatConversation(converted)).toBe(true);
    });
    
    test('isChatConversation correctly identifies chat conversations', () => {
      const validConversation: ChatConversation = {
        id: 'conv_123',
        title: 'Test',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
        messages: [],
      };
      
      const invalidConversation = {
        id: 'conv_123',
        title: 'Test',
        // Missing messages
      };
      
      expect(isChatConversation(validConversation)).toBe(true);
      expect(isChatConversation(invalidConversation)).toBe(false);
      expect(isChatConversation(null)).toBe(false);
      expect(isChatConversation(undefined)).toBe(false);
    });
  });
});

describe('Error Handling Utilities', () => {
  describe('AppError', () => {
    test('creates AppError with correct properties', () => {
      const error = new AppError('Test error', ErrorCode.API_ERROR, { status: 404 });
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(ErrorCode.API_ERROR);
      expect(error.details).toEqual({ status: 404 });
      expect(error.name).toBe('AppError');
      expect(error.stack).toBeDefined();
    });
    
    test('factory methods create correct error types', () => {
      const networkError = AppError.network('Network failed');
      const apiError = AppError.api('API failed');
      const authError = AppError.auth('Auth failed');
      const validationError = AppError.validation('Validation failed');
      const unexpectedError = AppError.unexpected('Unexpected error');
      const userInputError = AppError.userInput('Invalid input');
      
      expect(networkError.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(apiError.code).toBe(ErrorCode.API_ERROR);
      expect(authError.code).toBe(ErrorCode.AUTHENTICATION_ERROR);
      expect(validationError.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(unexpectedError.code).toBe(ErrorCode.UNEXPECTED_ERROR);
      expect(userInputError.code).toBe(ErrorCode.USER_INPUT_ERROR);
    });
    
    test('isAppError correctly identifies AppError instances', () => {
      const appError = new AppError('Test', ErrorCode.API_ERROR);
      const standardError = new Error('Standard error');
      
      expect(AppError.isAppError(appError)).toBe(true);
      expect(AppError.isAppError(standardError)).toBe(false);
      expect(AppError.isAppError(null)).toBe(false);
      expect(AppError.isAppError(undefined)).toBe(false);
      expect(AppError.isAppError('string')).toBe(false);
      expect(AppError.isAppError({})).toBe(false);
    });
  });
  
  describe('handleError', () => {
    test('handles AppError instances', () => {
      const appError = new AppError('Test error', ErrorCode.API_ERROR);
      const result = handleError(appError, 'test-context');
      
      expect(result).toBe(appError);
    });
    
    test('converts standard Error to AppError', () => {
      const standardError = new Error('Standard error');
      const result = handleError(standardError, 'test-context');
      
      expect(AppError.isAppError(result)).toBe(true);
      expect(result.code).toBe(ErrorCode.UNEXPECTED_ERROR);
      expect(result.message).toBe('Standard error');
      expect(result.originalError).toBe(standardError);
    });
    
    test('converts string to AppError', () => {
      const result = handleError('String error', 'test-context');
      
      expect(AppError.isAppError(result)).toBe(true);
      expect(result.code).toBe(ErrorCode.UNEXPECTED_ERROR);
      expect(result.message).toBe('String error');
    });
    
    test('handles other error types', () => {
      const result = handleError({ custom: 'error' }, 'test-context');
      
      expect(AppError.isAppError(result)).toBe(true);
      expect(result.code).toBe(ErrorCode.UNEXPECTED_ERROR);
      expect(result.message).toBe('An unexpected error occurred');
      expect(result.details).toEqual({ custom: 'error' });
    });
  });
  
  describe('safeExecute', () => {
    test('returns result when operation succeeds', async () => {
      const operation = async () => 'success';
      const result = await safeExecute(operation, 'test-context');
      
      expect(result.result).toBe('success');
      expect(result.error).toBeUndefined();
    });
    
    test('returns error when operation fails', async () => {
      const operation = async () => { throw new Error('Operation failed'); };
      const result = await safeExecute(operation, 'test-context');
      
      expect(result.result).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(AppError.isAppError(result.error)).toBe(true);
      expect(result.error!.message).toBe('Operation failed');
    });
    
    test('returns fallback when operation fails and fallback is provided', async () => {
      const operation = async () => { throw new Error('Operation failed'); };
      const result = await safeExecute(operation, 'test-context', 'fallback');
      
      expect(result.result).toBe('fallback');
      expect(result.error).toBeDefined();
    });
  });
});