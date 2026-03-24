// No-op on web — expo-notifications has side effects that crash during web SSR
export function usePushNotifications() {}
export async function unregisterPushToken(_accessToken: string): Promise<void> {}
