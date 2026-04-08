import type { GPSPoint, RecordingSession } from '../types';

// 20 GPS points along the Yosemite Valley Loop trail, matching the Go fixture coordinates.
// Timestamps start at 2025-07-15T08:00:00Z, spaced 2 minutes apart.
export const mockGPSPoints: GPSPoint[] = [
  { id: 'gps_001', sessionId: 'sess_001', lat: 37.7567, lon: -119.5966, ele: 1209.0, speed: 0.8, timestamp: '2025-07-15T08:00:00Z', accuracy: 3.2, synced: 0 },
  { id: 'gps_002', sessionId: 'sess_001', lat: 37.7571, lon: -119.5963, ele: 1215.4, speed: 0.75, timestamp: '2025-07-15T08:02:00Z', accuracy: 2.8, synced: 0 },
  { id: 'gps_003', sessionId: 'sess_001', lat: 37.7576, lon: -119.5958, ele: 1223.1, speed: 0.82, timestamp: '2025-07-15T08:04:00Z', accuracy: 3.0, synced: 0 },
  { id: 'gps_004', sessionId: 'sess_001', lat: 37.7580, lon: -119.5952, ele: 1232.7, speed: 0.78, timestamp: '2025-07-15T08:06:00Z', accuracy: 2.5, synced: 0 },
  { id: 'gps_005', sessionId: 'sess_001', lat: 37.7585, lon: -119.5947, ele: 1241.3, speed: 0.80, timestamp: '2025-07-15T08:08:00Z', accuracy: 3.1, synced: 0 },
  { id: 'gps_006', sessionId: 'sess_001', lat: 37.7589, lon: -119.5941, ele: 1251.8, speed: 0.76, timestamp: '2025-07-15T08:10:00Z', accuracy: 2.9, synced: 0 },
  { id: 'gps_007', sessionId: 'sess_001', lat: 37.7593, lon: -119.5935, ele: 1263.2, speed: 0.74, timestamp: '2025-07-15T08:12:00Z', accuracy: 3.4, synced: 0 },
  { id: 'gps_008', sessionId: 'sess_001', lat: 37.7597, lon: -119.5930, ele: 1274.6, speed: 0.79, timestamp: '2025-07-15T08:14:00Z', accuracy: 2.7, synced: 0 },
  { id: 'gps_009', sessionId: 'sess_001', lat: 37.7601, lon: -119.5924, ele: 1286.0, speed: 0.81, timestamp: '2025-07-15T08:16:00Z', accuracy: 3.3, synced: 0 },
  { id: 'gps_010', sessionId: 'sess_001', lat: 37.7605, lon: -119.5919, ele: 1298.5, speed: 0.77, timestamp: '2025-07-15T08:18:00Z', accuracy: 2.6, synced: 0 },
  { id: 'gps_011', sessionId: 'sess_001', lat: 37.7609, lon: -119.5914, ele: 1312.1, speed: 0.73, timestamp: '2025-07-15T08:20:00Z', accuracy: 3.0, synced: 0 },
  { id: 'gps_012', sessionId: 'sess_001', lat: 37.7612, lon: -119.5910, ele: 1325.0, speed: 0.70, timestamp: '2025-07-15T08:22:00Z', accuracy: 2.4, synced: 0 },
  { id: 'gps_013', sessionId: 'sess_001', lat: 37.7615, lon: -119.5907, ele: 1331.0, speed: 0.68, timestamp: '2025-07-15T08:24:00Z', accuracy: 3.5, synced: 0 },
  { id: 'gps_014', sessionId: 'sess_001', lat: 37.7618, lon: -119.5903, ele: 1325.8, speed: 0.82, timestamp: '2025-07-15T08:26:00Z', accuracy: 2.8, synced: 0 },
  { id: 'gps_015', sessionId: 'sess_001', lat: 37.7620, lon: -119.5899, ele: 1314.2, speed: 0.85, timestamp: '2025-07-15T08:28:00Z', accuracy: 3.1, synced: 0 },
  { id: 'gps_016', sessionId: 'sess_001', lat: 37.7622, lon: -119.5895, ele: 1300.6, speed: 0.88, timestamp: '2025-07-15T08:30:00Z', accuracy: 2.9, synced: 0 },
  { id: 'gps_017', sessionId: 'sess_001', lat: 37.7624, lon: -119.5891, ele: 1285.9, speed: 0.90, timestamp: '2025-07-15T08:32:00Z', accuracy: 2.5, synced: 0 },
  { id: 'gps_018', sessionId: 'sess_001', lat: 37.7625, lon: -119.5888, ele: 1268.3, speed: 0.87, timestamp: '2025-07-15T08:34:00Z', accuracy: 3.2, synced: 0 },
  { id: 'gps_019', sessionId: 'sess_001', lat: 37.7627, lon: -119.5884, ele: 1248.1, speed: 0.83, timestamp: '2025-07-15T08:36:00Z', accuracy: 2.7, synced: 0 },
  { id: 'gps_020', sessionId: 'sess_001', lat: 37.7629, lon: -119.5880, ele: 1228.0, speed: 0.80, timestamp: '2025-07-15T08:38:00Z', accuracy: 3.0, synced: 0 },
];

export const mockRecordingSession: RecordingSession = {
  id: 'sess_001',
  trackId: 'trk_yosemite_001',
  state: 'recording',
  startedAt: '2025-07-15T08:00:00Z',
  lastPointAt: '2025-07-15T08:38:00Z',
  pointCount: 20,
  batchSeq: 2,
};

export const mockCompletedSession: RecordingSession = {
  id: 'sess_002',
  trackId: 'trk_yosemite_002',
  state: 'complete',
  startedAt: '2025-07-14T09:00:00Z',
  lastPointAt: '2025-07-14T10:15:00Z',
  pointCount: 38,
  batchSeq: 4,
};

export const mockOrphanedSession: RecordingSession = {
  id: 'sess_003',
  trackId: 'trk_crashed_001',
  state: 'recording',
  startedAt: '2025-07-13T16:30:00Z',
  lastPointAt: '2025-07-13T16:45:00Z',
  pointCount: 8,
  batchSeq: 1,
};
