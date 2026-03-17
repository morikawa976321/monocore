import { LoginClient } from '@/src/components/auth/LoginClient'

type LoginPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const resolvedSearchParams = await searchParams
    const errorParam = resolvedSearchParams?.error
    const initialErrorCode = Array.isArray(errorParam)
        ? (errorParam[0] ?? null)
        : (errorParam ?? null)

    return <LoginClient initialErrorCode={initialErrorCode} />
}
