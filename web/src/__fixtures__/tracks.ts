import type { Track } from '../types';

export const mockYosemiteTrack: Track = {
  id: 'trk_yosemite_001',
  userId: 'usr_test_001',
  name: 'Yosemite Valley Loop',
  activityType: 'hike',
  description: 'A scenic loop through Yosemite Valley near the falls trailhead.',
  geometry: {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-119.5966, 37.7567, 1209.0],
        [-119.5963, 37.7571, 1215.4],
        [-119.5958, 37.7576, 1223.1],
        [-119.5952, 37.7580, 1232.7],
        [-119.5947, 37.7585, 1241.3],
        [-119.5941, 37.7589, 1251.8],
        [-119.5935, 37.7593, 1263.2],
        [-119.5930, 37.7597, 1274.6],
        [-119.5924, 37.7601, 1286.0],
        [-119.5919, 37.7605, 1298.5],
        [-119.5914, 37.7609, 1312.1],
        [-119.5910, 37.7612, 1325.0],
        [-119.5907, 37.7615, 1331.0],
        [-119.5903, 37.7618, 1325.8],
        [-119.5899, 37.7620, 1314.2],
        [-119.5895, 37.7622, 1300.6],
        [-119.5891, 37.7624, 1285.9],
        [-119.5888, 37.7625, 1268.3],
        [-119.5884, 37.7627, 1248.1],
        [-119.5880, 37.7629, 1228.0],
      ],
    },
    properties: {},
  },
  stats: {
    distance: 1847.3,
    duration: 2400,
    elevationGain: 122.0,
    elevationLoss: 103.0,
    avgSpeed: 0.77,
    hrZones: null,
  },
  createdAt: '2025-07-15T08:00:00Z',
  updatedAt: '2025-07-15T08:40:00Z',
};

export const mockBikeTrack: Track = {
  id: 'trk_bike_001',
  userId: 'usr_test_001',
  name: 'Morning Bay Ride',
  activityType: 'bike',
  description: 'Quick morning bike ride along the bay.',
  geometry: {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-122.3894, 37.7694, 5.0],
        [-122.3880, 37.7700, 4.8],
        [-122.3865, 37.7710, 5.2],
        [-122.3850, 37.7718, 4.5],
        [-122.3838, 37.7725, 5.1],
      ],
    },
    properties: {},
  },
  stats: {
    distance: 620.5,
    duration: 180,
    elevationGain: 3.2,
    elevationLoss: 3.0,
    avgSpeed: 3.45,
    hrZones: null,
  },
  createdAt: '2025-08-01T07:30:00Z',
  updatedAt: '2025-08-01T07:33:00Z',
};

const mockPaddleTrack: Track = {
  id: 'trk_paddle_001',
  userId: 'usr_test_001',
  name: 'Lake Tahoe Paddle',
  activityType: 'paddle',
  description: 'Afternoon paddle on Lake Tahoe.',
  geometry: {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.0324, 39.0968, 1898.0],
        [-120.0310, 39.0975, 1898.0],
        [-120.0295, 39.0982, 1898.0],
        [-120.0280, 39.0988, 1898.0],
      ],
    },
    properties: {},
  },
  stats: {
    distance: 450.0,
    duration: 900,
    elevationGain: 0.0,
    elevationLoss: 0.0,
    avgSpeed: 0.5,
    hrZones: null,
  },
  createdAt: '2025-08-10T14:00:00Z',
  updatedAt: '2025-08-10T14:15:00Z',
};

export const mockEmptyTrackList: Track[] = [];

export const mockTrackList: Track[] = [
  mockYosemiteTrack,
  mockBikeTrack,
  mockPaddleTrack,
];
