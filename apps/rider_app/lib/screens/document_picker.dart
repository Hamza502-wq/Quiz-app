import 'package:doorstep_core/doorstep_core.dart';
import 'package:flutter/material.dart';

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
