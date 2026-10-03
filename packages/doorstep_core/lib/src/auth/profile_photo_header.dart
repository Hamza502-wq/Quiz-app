import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../api/api_exception.dart';
import '../theme.dart';
import '../utils/photo_picker.dart';
import '../widgets/avatar.dart';
import '../widgets/feedback.dart';
import 'auth_controller.dart';

/// The signed-in person's photo, name and phone, with a camera button to add
/// or change the profile photo (uploaded as kind=avatar, saved on the account).
class ProfilePhotoHeader extends StatefulWidget {
  const ProfilePhotoHeader({super.key, this.subtitle});

  /// Shown under the phone number (e.g. the vehicle for riders).
  final String? subtitle;

  @override
  State<ProfilePhotoHeader> createState() => _ProfilePhotoHeaderState();
}

class _ProfilePhotoHeaderState extends State<ProfilePhotoHeader> {
  bool _busy = false;

  Future<void> _change() async {
    final auth = context.read<AuthController>();
    setState(() => _busy = true);
    try {
      final url = await pickAndUpload(context, kind: 'avatar', preferredCamera: CameraDevice.front);
      if (url == null) return;
      await auth.updateProfile({'avatarUrl': url});
      if (mounted) showSnack(context, 'Profile photo updated');
    } catch (e) {
      if (mounted) showSnack(context, errorMessage(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<AuthController>().profile;
    final hasPhoto = profile?.avatarUrl != null;
    return Row(
      children: [
        Semantics(
          button: true,
          label: hasPhoto ? 'Change profile photo' : 'Add a profile photo',
          child: InkWell(
            onTap: _busy ? null : _change,
            customBorder: const CircleBorder(),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                UserAvatar(url: profile?.avatarUrl, name: profile?.name ?? profile?.phone, size: 72),
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: DsColors.orange,
                      shape: BoxShape.circle,
                      border: Border.all(color: DsColors.white, width: 2),
                    ),
                    child: _busy
                        ? const Padding(padding: EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.photo_camera_rounded, size: 16, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(profile?.name ?? 'Your account', style: Theme.of(context).textTheme.titleLarge),
              if (profile != null) Text(profile.phone, style: const TextStyle(color: DsColors.muted)),
              if (widget.subtitle != null) Text(widget.subtitle!, style: const TextStyle(color: DsColors.muted, fontSize: 13)),
              if (!hasPhoto)
                TextButton(
                  onPressed: _busy ? null : _change,
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                  child: const Text('Add a profile photo'),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
