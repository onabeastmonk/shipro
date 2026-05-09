'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TodayDriveRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/my-trips') }, [router])
  return null
}
