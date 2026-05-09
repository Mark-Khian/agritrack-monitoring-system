import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const res = await axios.post(
                'http://localhost:5000/api/auth/forgot-password',
                { email }
            );
            setMessage(res.data.message);
        } catch (err) {
            setError(err.response?.data?.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-600 flex items-center justify-center px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">

                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🌾</div>
                    <h1 className="text-3xl font-bold text-green-800">AgriTrack</h1>
                    <p className="text-gray-500 text-sm mt-1">Forgot Password</p>
                </div>

                {/* Success */}
                {message && (
                    <div className="bg-green-100 text-green-700 text-sm px-4 py-3 rounded-lg mb-5">
                        ✅ {message}
                        <p className="text-xs mt-1 text-green-600">
                            Please check your Gmail inbox.
                        </p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-100 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
                        ❌ {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="Enter your registered email"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !!message}
                        className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg transition duration-200 disabled:opacity-50"
                    >
                        {loading ? 'Sending...' : '📧 Send Reset Link'}
                    </button>

                    <p className="text-center text-sm text-gray-500">
                        Remember your password?{' '}
                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            className="text-green-700 font-medium hover:underline"
                        >
                            Back to Login
                        </button>
                    </p>
                </form>

            </div>
        </div>
    );
};

export default ForgotPassword;