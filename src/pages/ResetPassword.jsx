import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    const [formData, setFormData] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.newPassword !== formData.confirmPassword) {
            return setError('Passwords do not match.');
        }

        setLoading(true);
        try {
            const res = await axios.post(
                'http://localhost:5000/api/auth/reset-password',
                {
                    token,
                    email,
                    newPassword: formData.newPassword
                }
            );
            setSuccess(res.data.message);
            setTimeout(() => navigate('/login'), 3000);
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
                    <p className="text-gray-500 text-sm mt-1">Reset Your Password</p>
                </div>

                {/* Success Message */}
                {success && (
                    <div className="bg-green-100 text-green-700 text-sm px-4 py-3 rounded-lg mb-5">
                        ✅ {success}
                        <p className="text-xs mt-1 text-green-600">
                            Redirecting to login in 3 seconds...
                        </p>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-100 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
                        ❌ {error}
                    </div>
                )}

                {/* Invalid Link */}
                {(!token || !email) ? (
                    <div className="text-center">
                        <p className="text-red-500 text-sm mb-4">
                            ⚠️ Invalid or missing reset link.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="text-green-700 underline text-sm"
                        >
                            Back to Login
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* New Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                New Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    name="newPassword"
                                    value={formData.newPassword}
                                    onChange={handleChange}
                                    required
                                    placeholder="Min 8 chars, uppercase, number, symbol"
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-sm"
                                >
                                    {showPass ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Confirm Password
                            </label>
                            <input
                                type={showPass ? 'text' : 'password'}
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                                placeholder="Re-enter your new password"
                                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                        </div>

                        {/* Password Rules */}
                        <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
                            <p className="font-medium text-gray-600 mb-1">Password must have:</p>
                            <p>✅ At least 8 characters</p>
                            <p>✅ One uppercase letter (A-Z)</p>
                            <p>✅ One lowercase letter (a-z)</p>
                            <p>✅ One number (0-9)</p>
                            <p>✅ One special character (!@#$...)</p>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || !!success}
                            className="w-full bg-green-700 hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg transition duration-200 disabled:opacity-50"
                        >
                            {loading ? 'Resetting...' : '🔑 Reset Password'}
                        </button>

                        {/* Back to Login */}
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
                )}

            </div>
        </div>
    );
};

export default ResetPassword;