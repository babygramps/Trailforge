import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from './mapStore';
import type { LayerPreset, RecordingSession } from '../types';

function resetStore() {
  useMapStore.setState(useMapStore.getInitialState());
}

describe('mapStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setCenter updates center coordinates', () => {
    useMapStore.getState().setCenter([-120.0, 38.0]);
    expect(useMapStore.getState().center).toEqual([-120.0, 38.0]);
  });

  it('setView updates both center and zoom', () => {
    useMapStore.getState().setView([-121.5, 36.5], 14);
    const state = useMapStore.getState();
    expect(state.center).toEqual([-121.5, 36.5]);
    expect(state.zoom).toBe(14);
  });

  it('toggleLayerVisibility flips visible flag', () => {
    // "satellite" starts as visible: false
    useMapStore.getState().toggleLayerVisibility('satellite');
    const layer = useMapStore.getState().layers.find((l) => l.id === 'satellite');
    expect(layer?.visible).toBe(true);

    // Toggle it again
    useMapStore.getState().toggleLayerVisibility('satellite');
    const layer2 = useMapStore.getState().layers.find((l) => l.id === 'satellite');
    expect(layer2?.visible).toBe(false);
  });

  it('toggleLayerVisibility clears activePreset', () => {
    // First apply a preset to set activePreset
    const preset: LayerPreset = {
      id: 'test-preset',
      name: 'Test',
      layers: {
        'topo-base': { visible: true, opacity: 1 },
      },
    };
    useMapStore.getState().applyPreset(preset);
    expect(useMapStore.getState().activePreset).toBe('test-preset');

    // Toggling a layer should clear the preset
    useMapStore.getState().toggleLayerVisibility('satellite');
    expect(useMapStore.getState().activePreset).toBeNull();
  });

  it('setLayerOpacity updates opacity for correct layer', () => {
    useMapStore.getState().setLayerOpacity('hillshade', 0.7);
    const hillshade = useMapStore.getState().layers.find((l) => l.id === 'hillshade');
    expect(hillshade?.opacity).toBe(0.7);

    // Other layers should remain untouched
    const contours = useMapStore.getState().layers.find((l) => l.id === 'contours');
    expect(contours?.opacity).toBe(0.6);
  });

  it('applyPreset applies all layer configs', () => {
    const preset: LayerPreset = {
      id: 'hiking',
      name: 'Hiking',
      layers: {
        'topo-base': { visible: true, opacity: 1 },
        satellite: { visible: false, opacity: 0.5 },
        hillshade: { visible: true, opacity: 0.8 },
        contours: { visible: true, opacity: 1 },
        'public-land': { visible: true, opacity: 0.6 },
        trails: { visible: true, opacity: 1 },
      },
    };
    useMapStore.getState().applyPreset(preset);

    const state = useMapStore.getState();
    const satellite = state.layers.find((l) => l.id === 'satellite');
    expect(satellite?.opacity).toBe(0.5);
    expect(satellite?.visible).toBe(false);

    const hillshade = state.layers.find((l) => l.id === 'hillshade');
    expect(hillshade?.opacity).toBe(0.8);
    expect(hillshade?.visible).toBe(true);

    const publicLand = state.layers.find((l) => l.id === 'public-land');
    expect(publicLand?.visible).toBe(true);
    expect(publicLand?.opacity).toBe(0.6);
  });

  it('applyPreset sets activePreset', () => {
    const preset: LayerPreset = {
      id: 'my-preset',
      name: 'My Preset',
      layers: {},
    };
    useMapStore.getState().applyPreset(preset);
    expect(useMapStore.getState().activePreset).toBe('my-preset');
  });

  it('setSelectedTrack stores track ID', () => {
    useMapStore.getState().setSelectedTrack('trk_yosemite_001');
    expect(useMapStore.getState().selectedTrackId).toBe('trk_yosemite_001');

    useMapStore.getState().setSelectedTrack(null);
    expect(useMapStore.getState().selectedTrackId).toBeNull();
  });

  it('setRecording updates isRecording and session', () => {
    const session: RecordingSession = {
      id: 'sess_001',
      trackId: 'trk_001',
      state: 'recording',
      startedAt: '2025-07-15T08:00:00Z',
      lastPointAt: null,
      pointCount: 0,
      batchSeq: 0,
    };
    useMapStore.getState().setRecording(true, session);
    const state = useMapStore.getState();
    expect(state.isRecording).toBe(true);
    expect(state.recordingSession).toEqual(session);

    useMapStore.getState().setRecording(false, null);
    const state2 = useMapStore.getState();
    expect(state2.isRecording).toBe(false);
    expect(state2.recordingSession).toBeNull();
  });

  it('default layers has correct count and IDs', () => {
    const layers = useMapStore.getState().layers;
    expect(layers).toHaveLength(8);
    const ids = layers.map((l) => l.id);
    expect(ids).toEqual([
      'topo-base',
      'satellite',
      'hillshade',
      'contours',
      'public-land',
      'trails',
      'my-tracks',
      'waypoints',
    ]);
  });
});
