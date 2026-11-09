import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/lib/format';

/**
 * Meal photos are downscaled to max 1024 px JPEG (~100 KB, ~1.5k tokens) and
 * kept in their own storage key, so the chat history only holds a reference.
 */
const PREFIX = 'fitlog-img:';
const MAX_SIDE = 1024;

export type ImageSource = 'camera' | 'library';

/** Opens the camera or photo library; returns a stored image id, or null if cancelled. */
export async function pickImage(source: ImageSource): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Geef de app toegang tot je camera in je instellingen.');
  }
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  const { width = 0, height = 0 } = asset;
  if (width > 0 && height > 0 && Math.max(width, height) > MAX_SIDE) {
    // Pass both sides: the web implementation does not accept `null` for the other one.
    const scale = MAX_SIDE / Math.max(width, height);
    context.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  if (!saved.base64) throw new Error('De foto kon niet worden verwerkt.');
  return storeImage(saved.base64);
}

export async function storeImage(base64: string): Promise<string> {
  const id = uid();
  await AsyncStorage.setItem(PREFIX + id, base64);
  return id;
}

export async function loadImage(id: string): Promise<string | null> {
  return AsyncStorage.getItem(PREFIX + id);
}

export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length) await AsyncStorage.multiRemove(ids.map((id) => PREFIX + id));
}
