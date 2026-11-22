import { LoginClient } from '@/src/components/auth/LoginClient'

export default function LoginPage() {
    // 期限切れ・無効なリンクのとき、/auth/callback が /login?error=… へ送ってくる。
    const initialErrorCode = new URLSearchParams(window.location.search).get('error')

    return <LoginClient initialErrorCode={initialErrorCode} />
}
