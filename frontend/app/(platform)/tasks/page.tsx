'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Redirect /tasks → /tasks-board (Jira-style board) */
const TasksPage = () => {
  const router = useRouter()
  useEffect(() => {
    router.replace('/tasks-board')
  }, [router])
  return <div />
}

export default TasksPage
