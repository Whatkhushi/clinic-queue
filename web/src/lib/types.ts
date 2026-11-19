export type Role = 'PATIENT' | 'STAFF' | 'ADMIN';

export type AppointmentStatus = 'BOOKED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface WorkingHours {
  id: number;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface Provider {
  id: number;
  name: string;
  specialty: string;
  slotMinutes: number;
  active: boolean;
  workingHours: WorkingHours[];
}

export interface Slot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface Appointment {
  id: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  isWalkIn: boolean;
  checkedInAt: string | null;
  patientName: string;
  patientEmail: string | null;
  provider: Pick<Provider, 'id' | 'name' | 'specialty'>;
  queue: { position: number; estimatedWaitMinutes: number } | null;
}

export interface PublicQueue {
  provider: Pick<Provider, 'id' | 'name' | 'specialty'>;
  nowServing: number | null;
  waiting: number[];
  waitingCount: number;
  estimatedWaitMinutes: number;
}
