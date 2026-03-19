import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { type ChatMessage, streamGroqChat } from '../lib/groq-chat'

export type ContextItem = {
  id: string
  label: string
  summary: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type ApartmentChatData = {
  apartmentId: string
  number: string
  score: number
  status: string
  electricity: number
  water: number
  co2: number
  humidity: number
  savings: number
}

type Props = {
  visible: boolean
  apartment: ApartmentChatData | null
  contextItems: ContextItem[]
  onRemoveContext: (id: string) => void
  onClose: () => void
}

const QUICK_PROMPTS = [
  "Summarize this apartment's data",
  'Any anomalies I should worry about?',
  'Top 3 recommendations?',
  'When is energy usage highest?',
]

const buildSystemPrompt = (apt: ApartmentChatData, contextItems: ContextItem[]): string => {
  const ctxSection =
    contextItems.length > 0
      ? `\n\n## User-pinned context\n${contextItems.map((c) => `### ${c.label}\n${c.summary}`).join('\n\n')}`
      : ''

  return `You are an AI assistant embedded in EcoHouse – a smart residential building OS.

## Apartment
- ID: ${apt.apartmentId} | #${apt.number}
- Eco Score: ${apt.score}/100 (${apt.status.toUpperCase()})
- Projected savings: ${apt.savings}%

## Live readings
- Electricity: ${apt.electricity.toFixed(1)} kWh
- Water: ${Math.round(apt.water)} L
- CO₂: ${Math.round(apt.co2)} ppm
- Humidity: ${Math.round(apt.humidity)}%
${ctxSection}

Instructions:
- Be concise, specific, and data-driven. Reference exact numbers.
- Format lists with "- " bullets and **bold** for key numbers.
- Reply in the same language the user writes in.`
}

export default function ApartmentChatModal({
  visible,
  apartment,
  contextItems,
  onRemoveContext,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  const dotAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!loading) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [loading, dotAnim])

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
  }, [])

  const sendMessage = useCallback(
    async (text?: string) => {
      if (!apartment) return
      const content = (text ?? input).trim()
      if (!content || loading) return

      const userMsg: Message = { role: 'user', content }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)
      setInput('')
      setLoading(true)
      scrollToEnd()

      const groqHistory: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(apartment, contextItems) },
        ...nextMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ]

      // Append empty assistant message for streaming
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      await streamGroqChat(
        groqHistory,
        (chunk) => {
          setMessages((prev) => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk }
            }
            return updated
          })
          scrollToEnd()
        },
        () => setLoading(false),
        (errorMsg) => {
          setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }])
          setLoading(false)
        },
      )
    },
    [apartment, contextItems, input, loading, messages, scrollToEnd],
  )

  const handleClearChat = () => setMessages([])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.aiBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Assistant</Text>
              <Text style={styles.headerSub}>
                Apt #{apartment?.number} · tap sections to pin context
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {messages.length > 0 && (
              <TouchableOpacity onPress={handleClearChat} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-down" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Context chips */}
        {contextItems.length > 0 && (
          <View style={styles.contextBar}>
            <Text style={styles.contextBarLabel}>PINNED CONTEXT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {contextItems.map((item) => (
                <View key={item.id} style={styles.chip}>
                  <Text style={styles.chipText}>{item.label}</Text>
                  <TouchableOpacity onPress={() => onRemoveContext(item.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="close" size={12} color="#64748b" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.quickPromptsWrap}>
              <Text style={styles.quickPromptsLabel}>Quick prompts</Text>
              {QUICK_PROMPTS.map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => sendMessage(p)}
                  style={styles.quickPromptBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickPromptText}>{p}</Text>
                  <Ionicons name="arrow-forward" size={12} color="#2563eb" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {messages.map((msg, i) => (
            <View
              key={i}
              style={[
                styles.msgRow,
                msg.role === 'user' ? styles.msgRowUser : styles.msgRowAssistant,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                ]}
              >
                {msg.content === '' && loading && i === messages.length - 1 ? (
                  <View style={styles.typingRow}>
                    {[0, 1, 2].map((n) => (
                      <Animated.View
                        key={n}
                        style={[
                          styles.typingDot,
                          {
                            opacity: dotAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: n === 1 ? [0.3, 1] : [0.6, 0.3],
                            }),
                          },
                        ]}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                    {msg.content}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything…"
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={800}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            blurOnSubmit
          />
          <TouchableOpacity
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  headerSub: { marginTop: 1, fontSize: 11, color: '#94a3b8' },
  iconBtn: { padding: 6 },

  contextBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  contextBarLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chipsRow: { gap: 6, flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 11, color: '#334155', fontWeight: '500' },

  messageList: { flex: 1, backgroundColor: '#f8fafc' },
  messageContent: { padding: 14, gap: 10, paddingBottom: 20 },

  quickPromptsWrap: { gap: 8, marginBottom: 4 },
  quickPromptsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  quickPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickPromptText: { fontSize: 13, color: '#334155', flex: 1, marginRight: 8 },

  msgRow: { flexDirection: 'row' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: '#1e293b',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: { fontSize: 13, color: '#fff', lineHeight: 20 },
  bubbleTextAssistant: { fontSize: 13, color: '#1e293b', lineHeight: 20 },

  typingRow: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 2 },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#94a3b8',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
})
