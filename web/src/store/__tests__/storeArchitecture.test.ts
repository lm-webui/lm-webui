/**
 * Store Architecture Tests
 * 
 * This file tests the unified store architecture.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';
import { ChatMessage } from '@/types/core';

describe('Store Architecture', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });
  
  test('store initializes correctly', () => {
    const store = useAppStore.getState();
    
    expect(store._storeName).toBe('app-store');
    expect(store._version).toBe(1);
    expect(store._initialized).toBe(true); // reset() sets it to true
  });
  
  test('chat slice initializes correctly', () => {
    const store = useAppStore.getState();
    
    expect(store.chat.conversations).toEqual({});
    expect(store.chat.activeChatId).toBeNull();
    expect(store.chat.conversationCreationLoading).toBe(false);
    expect(store.chat.imageGenerationLoading).toBe(false);
    expect(store.chat.processingImages).toEqual([]);
    expect(store.chat.lastError).toBeNull();
  });
  
  test('can create new chat', () => {
    const { createNewChat } = useAppStore.getState().chat;
    
    const chatId = createNewChat();
    
    expect(chatId).toMatch(/^chat_\d+_/);
    
    const store = useAppStore.getState();
    expect(store.chat.activeChatId).toBe(chatId);
    expect(store.chat.conversations[chatId]).toBeDefined();
    expect(store.chat.conversations[chatId].title).toBe('New Chat');
    expect(store.chat.conversations[chatId].messages).toEqual([]);
  });
  
  test('can set active chat', () => {
    const { createNewChat, setActiveChat } = useAppStore.getState().chat;
    
    const chatId1 = createNewChat();
    const chatId2 = `chat_${Date.now()}_test`;
    
    // Create second conversation manually
    useAppStore.getState().chat.updateConversation(chatId2, {
      id: chatId2,
      title: 'Test Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    });
    
    setActiveChat(chatId2);
    
    const store = useAppStore.getState();
    expect(store.chat.activeChatId).toBe(chatId2);
  });
  
  test('can add message to chat', () => {
    const { createNewChat, addMessage } = useAppStore.getState().chat;
    
    const chatId = createNewChat();
    
    const message: ChatMessage = {
      id: 'msg1',
      role: 'user',
      content: 'Hello, world!',
      createdAt: new Date().toISOString(),
    };
    
    addMessage(chatId, message);
    
    const store = useAppStore.getState();
    const conversation = store.chat.conversations[chatId];
    
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].id).toBe('msg1');
    expect(conversation.messages[0].content).toBe('Hello, world!');
    expect(conversation.messages[0].role).toBe('user');
  });
  
  test('can update conversation', () => {
    const { createNewChat, updateConversation } = useAppStore.getState().chat;
    
    const chatId = createNewChat();
    
    updateConversation(chatId, {
      title: 'Updated Title',
      pinned: true,
    });
    
    const store = useAppStore.getState();
    const conversation = store.chat.conversations[chatId];
    
    expect(conversation.title).toBe('Updated Title');
    expect(conversation.pinned).toBe(true);
  });
  
  test('activeConversation selector works', () => {
    const { createNewChat, activeConversation } = useAppStore.getState().chat;
    
    // No active chat
    expect(activeConversation()).toBeNull();
    
    // Create and activate chat
    const chatId = createNewChat();
    const conversation = activeConversation();
    
    expect(conversation).toBeDefined();
    expect(conversation?.id).toBe(chatId);
  });
  
  test('activeMessages selector works', () => {
    const { createNewChat, addMessage, activeMessages } = useAppStore.getState().chat;
    
    const chatId = createNewChat();
    
    // No messages initially
    expect(activeMessages()).toEqual([]);
    
    // Add message
    const message: ChatMessage = {
      id: 'msg1',
      role: 'user',
      content: 'Test message',
      createdAt: new Date().toISOString(),
    };
    
    addMessage(chatId, message);
    
    const messages = activeMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Test message');
  });
  
  test('can handle image generation loading state', () => {
    const { startImageGeneration, completeImageGeneration, imageGenerationLoading } = useAppStore.getState().chat;
    
    expect(imageGenerationLoading).toBe(false);
    
    startImageGeneration();
    expect(useAppStore.getState().chat.imageGenerationLoading).toBe(true);
    
    completeImageGeneration();
    expect(useAppStore.getState().chat.imageGenerationLoading).toBe(false);
  });
  
  test('can handle errors', () => {
    const { setError, clearError, lastError } = useAppStore.getState().chat;
    
    expect(lastError).toBeNull();
    
    setError('Test error');
    expect(useAppStore.getState().chat.lastError).toBe('Test error');
    
    clearError();
    expect(useAppStore.getState().chat.lastError).toBeNull();
  });
  
  test('can handle processing images', () => {
    const { addProcessingImage, removeProcessingImage, isImageProcessing, processingImages } = useAppStore.getState().chat;
    
    expect(processingImages).toEqual([]);
    
    addProcessingImage('img1');
    expect(useAppStore.getState().chat.processingImages).toContain('img1');
    expect(isImageProcessing('img1')).toBe(true);
    expect(isImageProcessing('img2')).toBe(false);
    
    addProcessingImage('img2');
    expect(useAppStore.getState().chat.processingImages).toHaveLength(2);
    
    removeProcessingImage('img1');
    expect(useAppStore.getState().chat.processingImages).not.toContain('img1');
    expect(isImageProcessing('img1')).toBe(false);
  });
  
  test('store hooks work correctly', () => {
    // Test that the exported hooks work
    // This is a basic test - actual hook testing would require React Testing Library
    expect(typeof useAppStore.getState().chat.setActiveChat).toBe('function');
    expect(typeof useAppStore.getState().chat.createNewChat).toBe('function');
    expect(typeof useAppStore.getState().chat.addMessage).toBe('function');
  });
});