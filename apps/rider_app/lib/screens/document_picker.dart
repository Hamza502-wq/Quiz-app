import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

/// Picks a photo (camera or gallery), compresses it and uploads it.
/// Returns the uploaded URL or null if cancelled.
Future<String?> pickAndUpload(BuildContext context, {required String kind, bool cameraOnly = false}) async {
  final api = context.read<ApiClient>();
  ImageSource? source = ImageSource.camera;
  if (!cameraOnly) {
    source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => Navigator.pop(context, ImageSource.camera)),
            ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from gallery'), onTap: () => Navigator.pop(context, ImageSource.gallery)),
          ],
        ),
      ),
    );
  }
  if (source == null) return null;
  final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 75);
  if (file == null) return null;
  final result = await api.uploadImage(await file.readAsBytes(), file.name, kind, mimeType: file.mimeType);
  return result.url;
}

/// Tile showing a document's upload state.
class DocumentTile extends StatefulWidget {
  const DocumentTile({super.key, required this.label, required this.url, required this.onUploaded, this.hint});
  final String label;
  final String? hint;
  final String? url;
  final ValueChanged<String> onUploaded;

  @override
  State<DocumentTile> createState() => _DocumentTileState();
}

class _DocumentTileState extends State<DocumentTile> {
  bool _uploading = false;

  Future<void> _pick() async {
    setState(() => _uploading = true);
    try {
      final url = await pickAndUpload(context, kind: 'document');
      if (url != null) widget.onUploaded(url);
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = widget.url != null;
    return Card(
      child: ListTile(
        onTap: _uploading ? null : _pick,
        leading: CircleAvatar(
          backgroundColor: done ? DsColors.greenLight : DsColors.orangeLight,
          child: _uploading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Icon(done ? Icons.check_rounded : Icons.upload_file_rounded, color: done ? DsColors.green : DsColors.orange),
        ),
        title: Text(widget.label, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(done ? 'Uploaded — tap to replace' : (widget.hint ?? 'Tap to upload a clear photo')),
      ),
    );
  }
}
