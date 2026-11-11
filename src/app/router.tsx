import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AccountLinkPage, ForgotPasswordPage } from '@/pages/auth/AccountLinkPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { EventPage } from '@/pages/event/EventPage';
import { GuestTicketPage } from '@/pages/event/GuestTicketPage';
import { EventFormPage } from '@/pages/eventForm/EventFormPage';
import { MyEventsPage } from '@/pages/myEvents/MyEventsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { DashboardPage } from '@/pages/organizer/DashboardPage';
import { PublishedPage } from '@/pages/organizer/PublishedPage';
import { VolunteersPage } from '@/pages/organizer/VolunteersPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { ScannerPage } from '@/pages/scanner/ScannerPage';
import { MyTicketsPage } from '@/pages/tickets/MyTicketsPage';
import { TicketPrintPage } from '@/pages/tickets/TicketPrintPage';
import { HomeRedirect, RequireAuth, RequireOrganizer } from './guards';

/**
 * Карта экранов MVP (секции 01–04 макета). Подробнее — docs/SCREENS.md.
 */
export const router = createBrowserRouter([
  // Печатная версия билета — без шапки и подвала
  { path: '/tickets/:ticketId/print', element: <TicketPrintPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomeRedirect /> },

      // 01 · Гость — открыто всем
      { path: 'e/:slug', element: <EventPage /> },
      { path: 'e/:slug/ticket/:ticketId', element: <GuestTicketPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'account-link', element: <AccountLinkPage /> },

      // 02–04 · Только для авторизованных
      {
        element: <RequireAuth />,
        children: [
          { path: 'tickets', element: <MyTicketsPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'events', element: <MyEventsPage /> },
          { path: 'events/new', element: <EventFormPage /> },
          {
            path: 'events/:eventId',
            children: [
              { element: <RequireOrganizer />, children: [{ path: 'edit', element: <EventFormPage /> }] },
              {
                element: <RequireOrganizer publishedOnly />,
                children: [
                  { path: 'published', element: <PublishedPage /> },
                  { path: 'dashboard', element: <DashboardPage /> },
                  { path: 'volunteers', element: <VolunteersPage /> },
                ],
              },
            ],
          },
          { path: 'events/:eventId/scanner', element: <ScannerPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
