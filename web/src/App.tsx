import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireRole from './components/RequireRole';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import BookPage from './pages/BookPage';
import MyAppointmentsPage from './pages/MyAppointmentsPage';
import StaffPage from './pages/StaffPage';
import AdminPage from './pages/AdminPage';
import BoardPage from './pages/BoardPage';

export default function App() {
  return (
    <Routes>
      {/* Full-screen waiting-room display, no nav bar */}
      <Route path="/board/:providerId" element={<BoardPage />} />

      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="book/:providerId" element={<BookPage />} />
        <Route
          path="my"
          element={
            <RequireRole roles={['PATIENT']}>
              <MyAppointmentsPage />
            </RequireRole>
          }
        />
        <Route
          path="staff"
          element={
            <RequireRole roles={['STAFF', 'ADMIN']}>
              <StaffPage />
            </RequireRole>
          }
        />
        <Route
          path="admin"
          element={
            <RequireRole roles={['ADMIN']}>
              <AdminPage />
            </RequireRole>
          }
        />
        <Route
          path="*"
          element={
            <div className="py-20 text-center">
              <h1 className="text-2xl font-semibold">Page not found</h1>
              <Link to="/" className="mt-4 inline-block text-brand-700 underline">
                Go home
              </Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
