import React, { useCallback, useEffect, useRef, useState } from 'react'
import DraggablePanel from './DraggablePanel'
import { apiFetch, parseJsonSafe } from '../utils/api'
import { ensureStyleInjected } from '../utils/styleInjection'

const LLM_CHAT_TIMEOUT_MS = Number(import.meta.env.VITE_LLM_CHAT_TIMEOUT_MS || 300000)

/**
 * Floating chat panel that lets users ask natural language questions
 * about the BIM model. Powered by an LLM with graph context.
 */
function LlmChatPanel({
  isOpen,
  onClose,
  jobId,
  onSelectResult,
  focusToken,
  zIndex,
}) {
  const [position, setPosition] = useState({ x: 340, y: 90 })
  const [size, setSize] = useState({ width: 380, height: 520 })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, focusToken])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !jobId || loading) return

    setInput('')
    setError(null)

    const userMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setLoading(true)

    try {
      // Send only the last 16 messages to stay within limits
      const historySlice = newMessages.slice(-16).map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await apiFetch(`/api/llm/${jobId}/chat`, {
        method: 'POST',
        body: { messages: historySlice },
        timeoutMs: LLM_CHAT_TIMEOUT_MS,
      })

      if (!response.ok) {
        const errData = await parseJsonSafe(response)
        throw new Error(errData?.detail || `Request failed (${response.status})`)
      }

      const data = await response.json()
      const assistantMessage = {
        role: 'assistant',
        content: data.answer || '(no response)',
        referencedIds: data.referenced_ids || [],
        reasoning: data.reasoning || null,
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      setError(err.message || 'Failed to get response')
    } finally {
      setLoading(false)
    }
  }, [input, jobId, loading, messages])

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleIdClick = useCallback((globalId) => {
    if (onSelectResult && globalId) {
      onSelectResult(globalId)
    }
  }, [onSelectResult])

  const handleClear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  if (!isOpen) return null

  const panelStyle = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    border: '1px solid #e5e5e7',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: zIndex || 1000,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }

  return (
    <DraggablePanel
      position={position}
      setPosition={setPosition}
      size={size}
      setSize={setSize}
      panelStyle={panelStyle}
      minWidth={320}
      minHeight={360}
      zIndex={zIndex}
      focusToken={focusToken}
      resizeHandleStyle={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: '18px',
        height: '18px',
        cursor: 'nwse-resize',
      }}
    >
      {/* Header */}
      <div className="drag-handle" style={styles.header}>
        <div style={styles.headerLeft}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={styles.headerTitle}>BIM Assistant</span>
        </div>
        <div style={styles.headerActions}>
          {messages.length > 0 && (
            <button onClick={handleClear} style={styles.clearButton} title="Clear chat">
              Clear
            </button>
          )}
          <button onClick={onClose} style={styles.closeButton} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && !loading && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <div style={styles.emptyTitle}>Ask about your building</div>
            <div style={styles.emptyHint}>
              Try: "What materials are used on Level 1?" or "How many walls are there?"
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.messageBubble,
              ...(msg.role === 'user' ? styles.userBubble : styles.assistantBubble),
            }}
          >
            {msg.role === 'assistant' && (
              <div style={styles.assistantLabel}>BIM Assistant</div>
            )}
            <div style={styles.messageContent}>
              {renderMessageContent(msg.content, msg.referencedIds, handleIdClick)}
            </div>
            {msg.referencedIds && msg.referencedIds.length > 0 && (
              <div style={styles.refSection}>
                <span style={styles.refLabel}>Referenced elements:</span>
                {msg.referencedIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => handleIdClick(id)}
                    style={styles.refBadge}
                    title={`Select ${id} in 3D viewer`}
                  >
                    {id.length > 12 ? id.slice(0, 10) + '…' : id}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
            <div style={styles.assistantLabel}>BIM Assistant</div>
            <div style={styles.typingIndicator}>
              <span className="llm-dot" style={{ animationDelay: '0s' }} />
              <span className="llm-dot" style={{ animationDelay: '0.15s' }} />
              <span className="llm-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}

        {error && (
          <div style={styles.errorBanner}>
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the building model..."
          style={styles.textInput}
          rows={1}
          disabled={loading || !jobId}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim() || !jobId}
          style={{
            ...styles.sendButton,
            ...(loading || !input.trim() ? styles.sendButtonDisabled : {}),
          }}
          title="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </DraggablePanel>
  )
}


/**
 * Render message content with clickable globalId references.
 */
function renderMessageContent(text, referencedIds, onIdClick) {
  if (!text) return null
  if (!referencedIds || referencedIds.length === 0) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
  }

  // Build a regex to match any referenced ID in the text
  const escaped = referencedIds.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = text.split(pattern)

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, idx) =>
        referencedIds.includes(part) ? (
          <button
            key={idx}
            onClick={() => onIdClick(part)}
            style={styles.inlineIdLink}
            title={`Select in 3D viewer`}
          >
            {part}
          </button>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </span>
  )
}


const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e5e7',
    cursor: 'grab',
    userSelect: 'none',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  clearButton: {
    background: 'none',
    border: 'none',
    fontSize: '12px',
    color: '#86868b',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    fontFamily: 'inherit',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#86868b',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '24px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '32px',
    marginBottom: '12px',
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1d1d1f',
    marginBottom: '6px',
  },
  emptyHint: {
    fontSize: '12px',
    color: '#86868b',
    lineHeight: 1.5,
  },
  messageBubble: {
    padding: '10px 14px',
    borderRadius: '12px',
    fontSize: '13px',
    lineHeight: 1.5,
    maxWidth: '92%',
    wordBreak: 'break-word',
  },
  userBubble: {
    background: '#0071e3',
    color: '#ffffff',
    alignSelf: 'flex-end',
    borderBottomRightRadius: '4px',
  },
  assistantBubble: {
    background: '#f5f5f7',
    color: '#1d1d1f',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: '4px',
  },
  assistantLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#86868b',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  messageContent: {
    fontSize: '13px',
    lineHeight: 1.6,
  },
  refSection: {
    marginTop: '8px',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px',
  },
  refLabel: {
    fontSize: '10px',
    color: '#86868b',
    marginRight: '4px',
  },
  refBadge: {
    background: '#e8f0fe',
    color: '#0071e3',
    border: 'none',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  inlineIdLink: {
    background: 'none',
    border: 'none',
    color: '#0071e3',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
    fontSize: 'inherit',
    fontFamily: 'monospace',
  },
  typingIndicator: {
    display: 'flex',
    gap: '4px',
    padding: '4px 0',
  },
  errorBanner: {
    background: '#fff2f2',
    color: '#d70015',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    alignSelf: 'center',
  },
  inputContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #e5e5e7',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    resize: 'none',
    border: '1px solid #e5e5e7',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    lineHeight: 1.4,
    maxHeight: '80px',
    overflowY: 'auto',
    background: '#fafafa',
  },
  sendButton: {
    background: '#0071e3',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 0.15s ease',
  },
  sendButtonDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
}

// Inject typing animation styles
const llmChatStyles = `
  .llm-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #86868b;
    display: inline-block;
    animation: llm-bounce 1s ease-in-out infinite;
  }
  @keyframes llm-bounce {
    0%, 100% { opacity: 0.3; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(-4px); }
  }
`
ensureStyleInjected('llm-chat-panel-styles', llmChatStyles)

export default LlmChatPanel
