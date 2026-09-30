export interface SimulatedParticipant {
  id: string;
  name: string;
  isHost: boolean;
  avatarColor: string;
  isCameraOn: boolean;
  isMuted: boolean;
  joinedAt: number;
}

export interface ExtensionLogEntry {
  id: string;
  timestamp: string;
  category: 'MeetRandom' | 'ParticipantDetector' | 'StudentManager' | 'RandomEngine';
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}
