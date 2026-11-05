import { redirect } from 'next/navigation';

// Profile editing now lives in the "Your profile" card on the dashboard.
export default function ProfilePage() {
    redirect('/dashboard');
}
