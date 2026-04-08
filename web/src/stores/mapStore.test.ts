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
    // "my-tracks" starts as visible: true
    useMapStore.getState().toggleLayerVisibility('my-tracks');
    const layer = useMapStore.getState().layers.find((l) => l.id === 'my-tracks');
    expect(layer?.visible).toBe(false);

    // Toggle it again
    useMapStore.getState().toggleLayerVisibility('my-tracks');
    const layer2 = useMapStore.getState().layers.find((l) => l.id === 'my-tracks');
    expect(layer2?.visible).toBe(true);
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
    useMapStore.getState().setLayerOpacity('topo-base', 0.7);
    const topo = useMapStore.getState().layers.find((l) => l.id === 'topo-base');
    expect(topo?.opacity).toBe(0.7);

    // Other layers should remain untouched
    const tracks = useMapStore.getState().layers.find((l) => l.id === 'my-tracks');
    expect(tracks?.opacity).toBe(1);
  });

  it('applyPreset applies all layer configs', () => {
    const preset: LayerPreset = {
      id: 'minimal',
      name: 'Minimal',
      layers: {
        'topo-base': { visible: true, opacity: 0.8 },
        'my-tracks': { visible: false, opacity: 0.5 },
        waypoints: { visible: true, opacity: 1 },
      },
    };
    useMapStore.getState().applyPreset(preset);

    const state = useMapStore.getState();
    const topo = state.layers.find((l) => l.id === 'topo-base');
    expect(topo?.opacity).toBe(0.8);
    expect(topo?.visible).toBe(true);

    const tracks = state.layers.find((l) => l.id === 'my-tracks');
    expect(tracks?.opacity).toBe(0.5);
    expect(tracks?.visible).toBe(false);

    const waypoints = state.layers.find((l) => l.id === 'waypoints');
    expect(waypoints?.visible).toBe(true);
    expect(waypoints?.opacity).toBe(1);
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
    expect(layers).toHaveLength(3);
    const ids = layers.map((l) => l.id);
    expect(ids).toEqual([
      'topo-base',
      'my-tracks',
      'waypoints',
    ]);
  });
});
