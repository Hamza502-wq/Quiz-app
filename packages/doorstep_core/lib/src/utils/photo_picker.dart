import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';

/// Picks a photo (camera or gallery), shrinks it and uploads it.
/// `kind`: avatar | document | proof | vendor | product.
/// Returns the uploaded URL, or null if the person cancelled.
Future<String?> pickAndUpload(
  BuildContext context, {
  required String kind,
  bool cameraOnly = false,
  CameraDevice preferredCamera = CameraDevice.rear,
}) async {
  final api = context.read<ApiClient>();
  ImageSource? source = ImageSource.camera;
  if (!cameraOnly) {
    source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }
  if (source == null) return null;
  final file = await ImagePicker().pickImage(
    source: source,
    maxWidth: 1600,
    maxHeight: 1600,
    imageQuality: 75,
    preferredCameraDevice: preferredCamera,
  );
  if (file == null) return null;
  final result = await api.uploadImage(await file.readAsBytes(), file.name, kind, mimeType: file.mimeType);
  return result.url;
}
