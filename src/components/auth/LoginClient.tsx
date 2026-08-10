'use client'

import React, { useState } from 'react'
import { createClient } from '@/src/lib/supabase/client'
import { LoadingIndicator } from '@/src/components/ui/LoadingIndicator'
import { Button } from '@/src/components/ui/Button'
import { Input } from '@/src/components/ui/Input'

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
                        <Button
                            color="link"
                            size="link"
                            onClick={() => {
                                setSent(false)
                                setEmail('')
                            }}
                        >
                            別のメールアドレスで試す
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-4">
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="メールアドレス"
                            required
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        )}
                        <Button
                            type="submit"
                            color="primary"
                            size="md"
                            disabled={loading || !email.trim()}
                            className="w-full"
                        >
                            {loading ? <LoadingIndicator label="送信中" /> : 'ログインリンクを送信'}
                        </Button>
                    </form>
                )}
            </div>
        </div>
    )
}
