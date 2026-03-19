import { NextRequest, NextResponse } from 'next/server'

type TaskAiAction = 'smart' | '5why' | 'checklist' | 'clarify' | 'risks' | 'dod'

type TaskPayload = {
  id: string
  title: string
  status: string
  priority: string
  description?: string | null
  goal?: string | null
}

const actionPrompts: Record<TaskAiAction, string> = {
  smart: 'Сформируй SMART-цель задачи с метрикой успеха, сроком и ожидаемым бизнес-эффектом.',
  '5why': 'Сделай анализ 5 Why и выдели корневую причину с короткими действиями для устранения.',
  checklist: 'Сформируй пошаговый чеклист выполнения задачи (5-8 шагов).',
  clarify: 'Перепиши задачу ясно и конкретно для команды без доменных знаний.',
  risks: 'Выяви ключевые риски и предложи меры снижения для каждого риска.',
  dod: 'Сформируй Definition of Done с понятными критериями приемки.',
}

const fallbackByAction: Record<TaskAiAction, string> = {
  smart: 'SMART: цель, измеримая метрика, достижимый результат, релевантность и срок.',
  '5why': '5 Why: определена корневая причина, предложены корректирующие шаги.',
  checklist: '1) Подготовка данных 2) Выполнение 3) Проверка качества 4) Документация 5) Согласование.',
  clarify: 'Уточненное описание: что сделать, зачем, кем и по какому критерию считать завершенным.',
  risks: 'Риски: срок, данные, зависимости. Меры: буфер времени, валидация данных, контрольные точки.',
  dod: 'Definition of Done: результат проверен, принят стейкхолдером, зафиксирован в системе.',
}

export async function POST(request: NextRequest) {
  const groqApiKey = process.env.GROQ_API_KEY
  const groqModel = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant'

  if (!groqApiKey) {
    return NextResponse.json({ detail: 'GROQ_API_KEY is not configured' }, { status: 500 })
  }

  try {
    const payload = (await request.json()) as { action?: TaskAiAction; task?: TaskPayload; locale?: 'ru' | 'en' }
    const action = payload.action
    const task = payload.task
    const locale = payload.locale ?? 'ru'

    if (!action || !task || !actionPrompts[action]) {
      return NextResponse.json({ detail: 'Invalid payload for AI action' }, { status: 400 })
    }

    const systemPrompt =
      locale == 'ru'
        ? 'Ты AI ассистент проджект-менеджмента. Отвечай кратко, структурировано, полезно и на русском.'
        : 'You are an AI project management assistant. Reply concisely and practically in English.'
    const userPrompt = `
Action:
${actionPrompts[action]}

Task context:
- title: ${task.title}
- description: ${task.description ?? ''}
- goal: ${task.goal ?? ''}
- status: ${task.status}
- priority: ${task.priority}
`.trim()

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const failurePayload = await response.json().catch(() => ({}))
      const detail = failurePayload?.error?.message ?? failurePayload?.detail ?? 'Groq request failed'
      return NextResponse.json({ detail }, { status: response.status })
    }

    const data = await response.json()
    const result: string | undefined = data?.choices?.[0]?.message?.content

    return NextResponse.json({
      task_id: task.id,
      action,
      result: result?.trim() || fallbackByAction[action],
    })
  } catch {
    return NextResponse.json({ detail: 'Failed to process AI request' }, { status: 500 })
  }
}
