'use client'

import React, { useState } from 'react'
import { createClient } from '@/src/lib/supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
    invalid_or_expired_link:
        'リンクの有効期限が切れているか無効です。再度ログインリンクを送信してください。',
}

type LoginClientProps = {
    initialErrorCode: string | null
}

export function LoginClient({ initialErrorCode }: LoginClientProps) {
    const initialErrorMessage = initialErrorCode
        ? (ERROR_MESSAGES[initialErrorCode] ?? initialErrorCode)
        : null
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(initialErrorMessage)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!email.trim()) return

        setLoading(true)
        setError(null)

        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        setLoading(false)

        if (error) {
            setError(error.message)
        } else {
            setSent(true)
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen -ml-12 bg-neutral-100 dark:bg-neutral-950">
            <div className="w-full max-w-sm px-2 sm:px-6">
                <h1 className="text-base sm:text-lg font-medium leading-6 sm:leading-7 tracking-widest uppercase text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-12 text-center">
                    Login
                </h1>

                {sent ? (
                    <div className="text-center space-y-2 sm:space-y-4">
                        <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                            <span className="font-medium text-neutral-900 dark:text-neutral-50">
                                {email}
                            </span>
                            {' '}にログインリンクを送信しました。
                        </p>
                        <p className="text-sm leading-6 text-neutral-500">
                            メールを確認してリンクをクリックしてください。
                        </p>
                        <button
                            onClick={() => {
                                setSent(false)
                                setEmail('')
                            }}
                            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors underline underline-offset-4"
                        >
                            別のメールアドレスで試す
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="メールアドレス"
                            required
                            autoFocus
                            className="w-full px-3 py-2 text-sm rounded-sm outline-none transition-colors bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 dark:focus:border-neutral-600 dark:focus:ring-neutral-600"
                        />
                        {error && (
                            <p className="text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className="w-full px-4 py-2 text-sm font-medium rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400 bg-amber-500 text-neutral-50 hover:bg-amber-600 dark:bg-amber-500 dark:text-neutral-950 dark:hover:bg-amber-400 disabled:opacity-40"
                        >
                            {loading ? '送信中...' : 'ログインリンクを送信'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
