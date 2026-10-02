// Models mirroring DoorStep API responses. Money values are US-dollar cents.

typedef Json = Map<String, dynamic>;

DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v as String)?.toLocal();
double _double(Object? v, [double fallback = 0]) => v == null ? fallback : (v as num).toDouble();
int _int(Object? v, [int fallback = 0]) => v == null ? fallback : (v as num).toInt();
List<T> _list<T>(Object? v, T Function(Json) f) => v == null ? <T>[] : (v as List).map((e) => f(e as Json)).toList();

enum OrderStatus {
  pendingPayment('PENDING_PAYMENT', 'Awaiting payment'),
  placed('PLACED', 'Order placed'),
  accepted('ACCEPTED', 'Being prepared'),
  readyForPickup('READY_FOR_PICKUP', 'Ready for pickup'),
  pickedUp('PICKED_UP', 'Picked up'),
  onTheWay('ON_THE_WAY', 'On the way'),
  delivered('DELIVERED', 'Delivered'),
  rejected('REJECTED', 'Rejected by store'),
  cancelled('CANCELLED', 'Cancelled');

  const OrderStatus(this.api, this.label);
  final String api;
  final String label;

  static OrderStatus parse(String v) => OrderStatus.values.firstWhere((s) => s.api == v, orElse: () => OrderStatus.placed);

  bool get isActive => const [placed, accepted, readyForPickup, pickedUp, onTheWay].contains(this);
  bool get isTerminal => const [delivered, rejected, cancelled].contains(this);
}

class Profile {
  Profile({
    required this.id,
    required this.phone,
    required this.roles,
    required this.preferredCurrency,
    required this.notificationChannel,
    this.name,
    this.email,
    this.avatarUrl,
    this.riderStatus,
    this.vendorId,
    this.customerId,
  });

  factory Profile.fromJson(Json j) => Profile(
        id: j['id'] as String,
        phone: j['phone'] as String,
        name: j['name'] as String?,
        email: j['email'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
        roles: (j['roles'] as List).cast<String>(),
        preferredCurrency: (j['preferredCurrency'] as String?) ?? 'USD',
        notificationChannel: (j['notificationChannel'] as String?) ?? 'SMS',
        riderStatus: (j['rider'] as Json?)?['status'] as String?,
        vendorId: (j['vendor'] as Json?)?['id'] as String?,
        customerId: (j['customer'] as Json?)?['id'] as String?,
      );

  final String id;
  final String phone;
  final String? name;
  final String? email;

  /// Profile photo (public upload), shown to riders, shops and customers.
  final String? avatarUrl;
  final List<String> roles;
  final String preferredCurrency;
  final String notificationChannel;
  final String? riderStatus;
  final String? vendorId;
  final String? customerId;

  Json toJson() => {
        'id': id,
        'phone': phone,
        'name': name,
        'email': email,
        'avatarUrl': avatarUrl,
        'roles': roles,
        'preferredCurrency': preferredCurrency,
        'notificationChannel': notificationChannel,
        'rider': riderStatus == null ? null : {'status': riderStatus},
        'vendor': vendorId == null ? null : {'id': vendorId},
        'customer': customerId == null ? null : {'id': customerId},
      };
}

class Category {
  Category({required this.id, required this.name, required this.slug, this.icon});
  factory Category.fromJson(Json j) =>
      Category(id: j['id'] as String, name: j['name'] as String, slug: j['slug'] as String, icon: j['icon'] as String?);
  final String id;
  final String name;
  final String slug;
  final String? icon;
}

class OpeningHour {
  OpeningHour({required this.dayOfWeek, required this.opensAt, required this.closesAt});
  factory OpeningHour.fromJson(Json j) =>
      OpeningHour(dayOfWeek: _int(j['dayOfWeek']), opensAt: j['opensAt'] as String, closesAt: j['closesAt'] as String);
  final int dayOfWeek;
  final String opensAt;
  final String closesAt;
}

class Vendor {
  Vendor({
    required this.id,
    required this.name,
    required this.slug,
    required this.phone,
    required this.lat,
    required this.lng,
    required this.addressLine,
    required this.isOpen,
    required this.avgPrepMinutes,
    required this.minOrderCents,
    required this.ratingAvg,
    required this.ratingCount,
    required this.openingHours,
    this.description,
    this.logoUrl,
    this.coverUrl,
    this.landmark,
    this.categorySlug,
    this.categoryName,
    this.distanceKm,
    this.deliveryFeeCents,
    this.etaMinutes,
  });

  factory Vendor.fromJson(Json j) => Vendor(
        id: j['id'] as String,
        name: j['name'] as String,
        slug: j['slug'] as String,
        description: j['description'] as String?,
        phone: j['phone'] as String,
        logoUrl: j['logoUrl'] as String?,
        coverUrl: j['coverUrl'] as String?,
        lat: _double(j['lat']),
        lng: _double(j['lng']),
        addressLine: j['addressLine'] as String,
        landmark: j['landmark'] as String?,
        categorySlug: (j['category'] as Json?)?['slug'] as String?,
        categoryName: (j['category'] as Json?)?['name'] as String?,
        isOpen: j['isOpen'] as bool? ?? false,
        avgPrepMinutes: _int(j['avgPrepMinutes'], 20),
        minOrderCents: _int(j['minOrderCents']),
        ratingAvg: _double(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
        openingHours: _list(j['openingHours'], OpeningHour.fromJson),
        distanceKm: j['distanceKm'] == null ? null : _double(j['distanceKm']),
        deliveryFeeCents: j['deliveryFeeCents'] == null ? null : _int(j['deliveryFeeCents']),
        etaMinutes: j['etaMinutes'] == null ? null : _int(j['etaMinutes']),
      );

  final String id;
  final String name;
  final String slug;
  final String? description;
  final String phone;
  final String? logoUrl;
  final String? coverUrl;
  final double lat;
  final double lng;
  final String addressLine;
  final String? landmark;
  final String? categorySlug;
  final String? categoryName;
  final bool isOpen;
  final int avgPrepMinutes;
  final int minOrderCents;
  final double ratingAvg;
  final int ratingCount;
  final List<OpeningHour> openingHours;
  final double? distanceKm;
  final int? deliveryFeeCents;
  final int? etaMinutes;
}

class Product {
  Product({
    required this.id,
    required this.vendorId,
    required this.name,
    required this.priceCents,
    required this.isAvailable,
    this.sectionId,
    this.description,
    this.imageUrl,
    this.thumbUrl,
    this.stockQty,
  });

  factory Product.fromJson(Json j) => Product(
        id: j['id'] as String,
        vendorId: j['vendorId'] as String,
        sectionId: j['sectionId'] as String?,
        name: j['name'] as String,
        description: j['description'] as String?,
        priceCents: _int(j['priceCents']),
        imageUrl: j['imageUrl'] as String?,
        thumbUrl: j['thumbUrl'] as String?,
        isAvailable: j['isAvailable'] as bool? ?? true,
        stockQty: j['stockQty'] == null ? null : _int(j['stockQty']),
      );

  final String id;
  final String vendorId;
  final String? sectionId;
  final String name;
  final String? description;
  final int priceCents;
  final String? imageUrl;
  final String? thumbUrl;
  final bool isAvailable;
  final int? stockQty;
}

class MenuSection {
  MenuSection({required this.id, required this.name, required this.products});
  factory MenuSection.fromJson(Json j) =>
      MenuSection(id: j['id'] as String, name: j['name'] as String, products: _list(j['products'], Product.fromJson));
  final String id;
  final String name;
  final List<Product> products;
}

class DeliveryEstimate {
  DeliveryEstimate({required this.distanceKm, required this.deliveryFeeCents, required this.etaMinutes, required this.deliverable});
  factory DeliveryEstimate.fromJson(Json j) => DeliveryEstimate(
        distanceKm: _double(j['distanceKm']),
        deliveryFeeCents: _int(j['deliveryFeeCents']),
        etaMinutes: _int(j['etaMinutes']),
        deliverable: j['deliverable'] as bool? ?? true,
      );
  final double distanceKm;
  final int deliveryFeeCents;
  final int etaMinutes;
  final bool deliverable;
}

class VendorMenu {
  VendorMenu({required this.vendor, required this.sections, this.delivery});
  factory VendorMenu.fromJson(Json j) => VendorMenu(
        vendor: Vendor.fromJson(j['vendor'] as Json),
        sections: _list(j['sections'], MenuSection.fromJson),
        delivery: j['delivery'] == null ? null : DeliveryEstimate.fromJson(j['delivery'] as Json),
      );
  final Vendor vendor;
  final List<MenuSection> sections;
  final DeliveryEstimate? delivery;
}

class Review {
  Review({required this.id, required this.score, required this.customerName, required this.createdAt, this.comment});
  factory Review.fromJson(Json j) => Review(
        id: j['id'] as String,
        score: _int(j['score']),
        comment: j['comment'] as String?,
        customerName: j['customerName'] as String? ?? 'Customer',
        createdAt: _date(j['createdAt'])!,
      );
  final String id;
  final int score;
  final String? comment;
  final String customerName;
  final DateTime createdAt;
}

class Address {
  Address({
    required this.id,
    required this.label,
    required this.lat,
    required this.lng,
    required this.city,
    required this.landmark,
    required this.isDefault,
    this.street,
    this.suburb,
  });

  factory Address.fromJson(Json j) => Address(
        id: j['id'] as String,
        label: j['label'] as String,
        lat: _double(j['lat']),
        lng: _double(j['lng']),
        street: j['street'] as String?,
        suburb: j['suburb'] as String?,
        city: j['city'] as String,
        landmark: j['landmark'] as String,
        isDefault: j['isDefault'] as bool? ?? false,
      );

  final String id;
  final String label;
  final double lat;
  final double lng;
  final String? street;
  final String? suburb;
  final String city;
  final String landmark;
  final bool isDefault;

  String get summary => [street, suburb, city].whereType<String>().where((s) => s.isNotEmpty).join(', ');
}

class Quote {
  Quote({
    required this.subtotalCents,
    required this.deliveryFeeCents,
    required this.tipCents,
    required this.totalCents,
    required this.currency,
    required this.exchangeRate,
    required this.totalLocalCents,
    required this.distanceKm,
    required this.etaMinutes,
    this.cashAllowed = true,
    this.cashLimitCents,
  });

  factory Quote.fromJson(Json j) => Quote(
        subtotalCents: _int(j['subtotalCents']),
        deliveryFeeCents: _int(j['deliveryFeeCents']),
        tipCents: _int(j['tipCents']),
        totalCents: _int(j['totalCents']),
        currency: j['currency'] as String,
        exchangeRate: _double(j['exchangeRate'], 1),
        totalLocalCents: _int(j['totalLocalCents']),
        distanceKm: _double(j['distanceKm']),
        etaMinutes: _int(j['etaMinutes']),
        cashAllowed: j['cashAllowed'] as bool? ?? true,
        cashLimitCents: j['cashLimitCents'] == null ? null : _int(j['cashLimitCents']),
      );

  final int subtotalCents;
  final int deliveryFeeCents;
  final int tipCents;
  final int totalCents;
  final String currency;
  final double exchangeRate;
  final int totalLocalCents;
  final double distanceKm;
  final int etaMinutes;

  /// Cash on delivery is only offered up to the riders' cash limit ([cashLimitCents]).
  final bool cashAllowed;
  final int? cashLimitCents;
}

class OrderItem {
  OrderItem({required this.id, required this.name, required this.quantity, required this.unitPriceCents, required this.lineTotalCents, this.productId, this.notes});
  factory OrderItem.fromJson(Json j) => OrderItem(
        id: j['id'] as String,
        productId: j['productId'] as String?,
        name: j['name'] as String,
        quantity: _int(j['quantity']),
        unitPriceCents: _int(j['unitPriceCents']),
        lineTotalCents: _int(j['lineTotalCents']),
        notes: j['notes'] as String?,
      );
  final String id;
  final String? productId;
  final String name;
  final int quantity;
  final int unitPriceCents;
  final int lineTotalCents;
  final String? notes;
}

class GeoPoint {
  GeoPoint(this.lat, this.lng);
  final double lat;
  final double lng;
}

class OrderPlace {
  OrderPlace({required this.lat, required this.lng, required this.address, this.landmark, this.contactName, this.contactPhone});
  factory OrderPlace.fromJson(Json j, {bool dropoff = false}) => OrderPlace(
        lat: _double(j['lat']),
        lng: _double(j['lng']),
        address: j['address'] as String,
        landmark: j['landmark'] as String?,
        contactName: (dropoff ? j['recipientName'] : j['contactName']) as String?,
        contactPhone: (dropoff ? j['recipientPhone'] : j['contactPhone']) as String?,
      );
  final double lat;
  final double lng;
  final String address;
  final String? landmark;
  final String? contactName;
  final String? contactPhone;
}

class OrderRider {
  OrderRider({
    required this.id,
    required this.vehicleDescription,
    required this.ratingAvg,
    this.vehicleType = 'MOTORBIKE',
    this.vehiclePlate,
    this.name,
    this.photoUrl,
    this.phone,
    this.location,
  });
  factory OrderRider.fromJson(Json j) {
    final loc = j['location'] as Json?;
    return OrderRider(
      id: j['id'] as String,
      name: j['name'] as String?,
      photoUrl: j['photoUrl'] as String?,
      phone: j['phone'] as String?,
      vehicleType: j['vehicleType'] as String? ?? 'MOTORBIKE',
      vehiclePlate: j['vehiclePlate'] as String?,
      vehicleDescription: j['vehicleDescription'] as String? ?? '',
      ratingAvg: _double(j['ratingAvg']),
      location: loc == null ? null : GeoPoint(_double(loc['lat']), _double(loc['lng'])),
    );
  }
  final String id;
  final String? name;
  final String? photoUrl;
  final String? phone;
  final String vehicleType;

  /// Zimbabwean number plate, e.g. "AEZ 1234"; null for bicycles.
  final String? vehiclePlate;
  final String vehicleDescription;
  final double ratingAvg;
  final GeoPoint? location;
}

class OrderAmounts {
  OrderAmounts({
    required this.subtotalCents,
    required this.deliveryFeeCents,
    required this.tipCents,
    required this.totalCents,
    required this.currency,
    required this.exchangeRate,
    required this.totalLocalCents,
    this.riderEarningCents,
  });
  factory OrderAmounts.fromJson(Json j) => OrderAmounts(
        subtotalCents: _int(j['subtotalCents']),
        deliveryFeeCents: _int(j['deliveryFeeCents']),
        tipCents: _int(j['tipCents']),
        totalCents: _int(j['totalCents']),
        currency: j['currency'] as String,
        exchangeRate: _double(j['exchangeRate'], 1),
        totalLocalCents: _int(j['totalLocalCents']),
        riderEarningCents: j['riderEarningCents'] == null ? null : _int(j['riderEarningCents']),
      );
  final int subtotalCents;
  final int deliveryFeeCents;
  final int tipCents;
  final int totalCents;
  final String currency;
  final double exchangeRate;
  final int totalLocalCents;
  final int? riderEarningCents;
}

class OrderPayment {
  OrderPayment({required this.id, required this.method, required this.status, this.redirectUrl, this.instructions});
  factory OrderPayment.fromJson(Json j) => OrderPayment(
        id: j['id'] as String,
        method: j['method'] as String,
        status: j['status'] as String,
        redirectUrl: j['redirectUrl'] as String?,
        instructions: j['instructions'] as String?,
      );
  final String id;
  final String method;
  final String status;
  final String? redirectUrl;
  final String? instructions;
}

class OrderEvent {
  OrderEvent({required this.id, required this.type, required this.createdAt, this.status, this.message});
  factory OrderEvent.fromJson(Json j) => OrderEvent(
        id: j['id'] as String,
        type: j['type'] as String,
        status: j['status'] == null ? null : OrderStatus.parse(j['status'] as String),
        message: j['message'] as String?,
        createdAt: _date(j['createdAt'])!,
      );
  final String id;
  final String type;
  final OrderStatus? status;
  final String? message;
  final DateTime createdAt;
}

class Order {
  Order({
    required this.id,
    required this.code,
    required this.type,
    required this.status,
    required this.statusLabel,
    required this.pickup,
    required this.dropoff,
    required this.distanceKm,
    required this.items,
    required this.amounts,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.createdAt,
    required this.canRate,
    this.unreadMessages = 0,
    this.vendorId,
    this.vendorName,
    this.vendorPhone,
    this.vendorLogoUrl,
    this.rider,
    this.customerName,
    this.customerPhotoUrl,
    this.customerPhone,
    this.parcelDescription,
    this.parcelSize,
    this.payment,
    this.deliveryPin,
    this.notes,
    this.prepMinutes,
    this.estimatedReadyAt,
    this.cancelReason,
    this.rejectReason,
    this.placedAt,
    this.deliveredAt,
    this.events = const [],
    this.hasDispute = false,
    this.disputeStatus,
    this.proofType,
  });

  factory Order.fromJson(Json j) {
    final vendor = j['vendor'] as Json?;
    final customer = j['customer'] as Json?;
    final parcel = j['parcel'] as Json?;
    final ts = j['timestamps'] as Json? ?? const {};
    final dispute = j['dispute'] as Json?;
    return Order(
      id: j['id'] as String,
      code: j['code'] as String,
      type: j['type'] as String,
      status: OrderStatus.parse(j['status'] as String),
      statusLabel: j['statusLabel'] as String? ?? '',
      vendorId: vendor?['id'] as String?,
      vendorName: vendor?['name'] as String?,
      vendorPhone: vendor?['phone'] as String?,
      vendorLogoUrl: vendor?['logoUrl'] as String?,
      rider: j['rider'] == null ? null : OrderRider.fromJson(j['rider'] as Json),
      customerName: customer?['name'] as String?,
      customerPhotoUrl: customer?['photoUrl'] as String?,
      customerPhone: customer?['phone'] as String?,
      pickup: OrderPlace.fromJson(j['pickup'] as Json),
      dropoff: OrderPlace.fromJson(j['dropoff'] as Json, dropoff: true),
      parcelDescription: parcel?['description'] as String?,
      parcelSize: parcel?['size'] as String?,
      distanceKm: _double(j['distanceKm']),
      items: _list(j['items'], OrderItem.fromJson),
      amounts: OrderAmounts.fromJson(j['amounts'] as Json),
      paymentMethod: j['paymentMethod'] as String,
      paymentStatus: j['paymentStatus'] as String,
      payment: j['payment'] == null ? null : OrderPayment.fromJson(j['payment'] as Json),
      deliveryPin: j['deliveryPin'] as String?,
      notes: j['notes'] as String?,
      prepMinutes: j['prepMinutes'] == null ? null : _int(j['prepMinutes']),
      estimatedReadyAt: _date(j['estimatedReadyAt']),
      cancelReason: j['cancelReason'] as String?,
      rejectReason: j['rejectReason'] as String?,
      canRate: j['canRate'] as bool? ?? false,
      createdAt: _date(ts['createdAt']) ?? DateTime.now(),
      placedAt: _date(ts['placedAt']),
      deliveredAt: _date(ts['deliveredAt']),
      events: _list(j['events'], OrderEvent.fromJson),
      hasDispute: dispute != null,
      disputeStatus: dispute?['status'] as String?,
      proofType: (j['proof'] as Json?)?['type'] as String?,
      unreadMessages: _int(j['unreadMessages']),
    );
  }

  final String id;
  final String code;
  final String type; // DELIVERY | PARCEL
  final OrderStatus status;
  final String statusLabel;
  final String? vendorId;
  final String? vendorName;
  final String? vendorPhone;
  final String? vendorLogoUrl;
  final OrderRider? rider;
  final String? customerName;
  final String? customerPhotoUrl;
  final String? customerPhone;
  final OrderPlace pickup;
  final OrderPlace dropoff;
  final String? parcelDescription;
  final String? parcelSize;
  final double distanceKm;
  final List<OrderItem> items;
  final OrderAmounts amounts;
  final String paymentMethod;
  final String paymentStatus;
  final OrderPayment? payment;
  final String? deliveryPin;
  final String? notes;
  final int? prepMinutes;
  final DateTime? estimatedReadyAt;
  final String? cancelReason;
  final String? rejectReason;
  final bool canRate;
  final DateTime createdAt;
  final DateTime? placedAt;
  final DateTime? deliveredAt;
  final List<OrderEvent> events;
  final bool hasDispute;
  final String? disputeStatus;
  final String? proofType;

  /// Order lists: chat messages from others on this order that haven't been read.
  final int unreadMessages;

  bool get isParcel => type == 'PARCEL';
  int get itemCount => items.fold(0, (s, i) => s + i.quantity);
  String get title => isParcel ? 'Parcel delivery' : (vendorName ?? 'Order');
}

class PaymentInfo {
  PaymentInfo({required this.id, required this.orderId, required this.method, required this.status, required this.currency, required this.amountCents, this.redirectUrl, this.instructions});
  factory PaymentInfo.fromJson(Json j) => PaymentInfo(
        id: j['id'] as String,
        orderId: j['orderId'] as String,
        method: j['method'] as String,
        status: j['status'] as String,
        currency: j['currency'] as String,
        amountCents: _int(j['amountCents']),
        redirectUrl: j['redirectUrl'] as String?,
        instructions: j['instructions'] as String?,
      );
  final String id;
  final String orderId;
  final String method;
  final String status;
  final String currency;
  final int amountCents;
  final String? redirectUrl;
  final String? instructions;

  bool get isPending => status == 'PENDING';
  bool get isPaid => status == 'PAID';
}

class TrackingSnapshot {
  TrackingSnapshot({required this.status, this.riderLocation, this.etaMinutes, this.riderName, this.riderPhotoUrl, this.vehiclePlate});
  factory TrackingSnapshot.fromJson(Json j) {
    final rider = j['rider'] as Json?;
    final loc = rider?['location'] as Json?;
    return TrackingSnapshot(
      status: OrderStatus.parse(j['status'] as String),
      riderLocation: loc == null ? null : GeoPoint(_double(loc['lat']), _double(loc['lng'])),
      etaMinutes: j['etaMinutes'] == null ? null : _int(j['etaMinutes']),
      riderName: rider?['name'] as String?,
      riderPhotoUrl: rider?['photoUrl'] as String?,
      vehiclePlate: rider?['vehiclePlate'] as String?,
    );
  }
  final OrderStatus status;
  final GeoPoint? riderLocation;
  final int? etaMinutes;
  final String? riderName;
  final String? riderPhotoUrl;
  final String? vehiclePlate;
}

class AppNotification {
  AppNotification({required this.id, required this.type, required this.title, required this.body, required this.createdAt, this.readAt, this.data = const {}});
  factory AppNotification.fromJson(Json j) => AppNotification(
        id: j['id'] as String,
        type: j['type'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        data: (j['data'] as Map?)?.map((k, v) => MapEntry(k.toString(), v.toString())) ?? const {},
        readAt: _date(j['readAt']),
        createdAt: _date(j['createdAt'])!,
      );
  final String id;
  final String type;
  final String title;
  final String body;
  final Map<String, String> data;
  final DateTime? readAt;
  final DateTime createdAt;
}

/// A message in an order's chat, shared by the customer, the store and the rider.
class ChatMessage {
  ChatMessage({
    required this.id,
    required this.orderId,
    required this.body,
    required this.mine,
    required this.createdAt,
    this.senderRole,
    this.senderName,
  });
  factory ChatMessage.fromJson(Json j) {
    final sender = j['sender'] as Json?;
    return ChatMessage(
      id: j['id'] as String,
      orderId: j['orderId'] as String,
      body: j['body'] as String,
      mine: j['mine'] as bool? ?? false,
      createdAt: _date(j['createdAt'])!,
      senderRole: sender?['role'] as String?,
      senderName: sender?['name'] as String?,
    );
  }
  final String id;
  final String orderId;
  final String body;
  final bool mine;
  final DateTime createdAt;

  /// "customer", "store" or "rider".
  final String? senderRole;
  final String? senderName;

  /// e.g. "Sadza Republic · Store", shown above other people's messages.
  String? get senderLabel {
    if (senderName == null) return null;
    final role = switch (senderRole) { 'store' => 'Store', 'rider' => 'Rider', 'customer' => 'Customer', _ => null };
    return role == null ? senderName : '$senderName · $role';
  }
}

/// A delivery zone a rider can choose to work in.
class DeliveryZone {
  DeliveryZone({required this.id, required this.name, required this.city});
  factory DeliveryZone.fromJson(Json j) => DeliveryZone(id: j['id'] as String, name: j['name'] as String, city: j['city'] as String? ?? '');
  final String id;
  final String name;
  final String city;
}

class Paged<T> {
  Paged({required this.items, required this.total, required this.page, required this.totalPages});
  factory Paged.fromJson(Json j, T Function(Json) f) =>
      Paged(items: _list(j['items'], f), total: _int(j['total']), page: _int(j['page'], 1), totalPages: _int(j['totalPages'], 1));
  final List<T> items;
  final int total;
  final int page;
  final int totalPages;
  bool get hasMore => page < totalPages;
}

// ───────────────────────────── Rider ─────────────────────────────

class WalletSummary {
  WalletSummary({
    required this.balanceCents,
    required this.availableForPayoutCents,
    required this.cashOwedCents,
    required this.cashLimitCents,
    required this.cashLimitRemainingCents,
  });
  factory WalletSummary.fromJson(Json j) => WalletSummary(
        balanceCents: _int(j['balanceCents']),
        availableForPayoutCents: _int(j['availableForPayoutCents']),
        cashOwedCents: _int(j['cashOwedCents']),
        cashLimitCents: _int(j['cashLimitCents']),
        cashLimitRemainingCents: _int(j['cashLimitRemainingCents']),
      );
  final int balanceCents;
  final int availableForPayoutCents;
  final int cashOwedCents;
  final int cashLimitCents;
  final int cashLimitRemainingCents;
}

class WalletTransaction {
  WalletTransaction({required this.id, required this.type, required this.amountCents, required this.balanceAfterCents, required this.description, required this.createdAt, this.orderCode});
  factory WalletTransaction.fromJson(Json j) => WalletTransaction(
        id: j['id'] as String,
        type: j['type'] as String,
        amountCents: _int(j['amountCents']),
        balanceAfterCents: _int(j['balanceAfterCents']),
        description: j['description'] as String,
        orderCode: j['orderCode'] as String?,
        createdAt: _date(j['createdAt'])!,
      );
  final String id;
  final String type;
  final int amountCents;
  final int balanceAfterCents;
  final String description;
  final String? orderCode;
  final DateTime createdAt;
}

class Payout {
  Payout({required this.id, required this.amountCents, required this.method, required this.accountNumber, required this.status, required this.requestedAt, this.reference, this.notes, this.isAutomatic = false});
  factory Payout.fromJson(Json j) => Payout(
        id: j['id'] as String,
        amountCents: _int(j['amountCents']),
        method: j['method'] as String,
        accountNumber: j['accountNumber'] as String,
        status: j['status'] as String,
        reference: j['reference'] as String?,
        notes: j['notes'] as String?,
        isAutomatic: j['isAutomatic'] as bool? ?? false,
        requestedAt: _date(j['requestedAt'])!,
      );
  final String id;
  final int amountCents;
  final String method;
  final String accountNumber;
  final String status;
  final String? reference;
  final String? notes;
  final bool isAutomatic;
  final DateTime requestedAt;
}

class DispatchOffer {
  DispatchOffer({
    required this.offerId,
    required this.expiresAt,
    required this.orderId,
    required this.orderCode,
    required this.type,
    required this.itemCount,
    required this.pickup,
    required this.dropoff,
    required this.distanceKm,
    required this.riderEarningCents,
    required this.tipCents,
    required this.paymentMethod,
    required this.cashToCollectCents,
    this.vendorName,
    this.distanceToPickupKm,
  });

  factory DispatchOffer.fromJson(Json j) {
    final o = j['order'] as Json;
    return DispatchOffer(
      offerId: j['offerId'] as String,
      expiresAt: _date(j['expiresAt'])!,
      distanceToPickupKm: j['distanceToPickupKm'] == null ? null : _double(j['distanceToPickupKm']),
      orderId: o['id'] as String,
      orderCode: o['code'] as String,
      type: o['type'] as String,
      vendorName: o['vendorName'] as String?,
      itemCount: _int(o['itemCount']),
      pickup: OrderPlace.fromJson(o['pickup'] as Json),
      dropoff: OrderPlace.fromJson(o['dropoff'] as Json),
      distanceKm: _double(o['distanceKm']),
      riderEarningCents: _int(o['riderEarningCents']),
      tipCents: _int(o['tipCents']),
      paymentMethod: o['paymentMethod'] as String,
      cashToCollectCents: _int(o['cashToCollectCents']),
    );
  }

  final String offerId;
  final DateTime expiresAt;
  final double? distanceToPickupKm;
  final String orderId;
  final String orderCode;
  final String type;
  final String? vendorName;
  final int itemCount;
  final OrderPlace pickup;
  final OrderPlace dropoff;
  final double distanceKm;
  final int riderEarningCents;
  final int tipCents;
  final String paymentMethod;
  final int cashToCollectCents;
}

class RiderStats {
  RiderStats({required this.deliveries, required this.earningsCents});
  factory RiderStats.fromJson(Json j) => RiderStats(deliveries: _int(j['deliveries']), earningsCents: _int(j['earningsCents']));
  final int deliveries;
  final int earningsCents;
}

class RiderProfile {
  RiderProfile({
    required this.id,
    required this.phone,
    required this.status,
    required this.isOnline,
    required this.vehicleType,
    required this.ratingAvg,
    required this.ratingCount,
    this.vehiclePlate,
    this.name,
    this.photoUrl,
    this.rejectionReason,
    this.vehicleMake,
    this.vehicleModel,
    this.vehicleColor,
    this.zoneId,
    this.zoneName,
    this.payoutMethod,
    this.payoutAccount,
    this.payoutAccountName,
    this.payoutBankName,
  });

  factory RiderProfile.fromJson(Json j) => RiderProfile(
        id: j['id'] as String,
        name: j['name'] as String?,
        photoUrl: j['photoUrl'] as String?,
        phone: j['phone'] as String,
        status: j['status'] as String,
        rejectionReason: j['rejectionReason'] as String?,
        isOnline: j['isOnline'] as bool? ?? false,
        vehicleType: j['vehicleType'] as String,
        vehicleMake: j['vehicleMake'] as String?,
        vehicleModel: j['vehicleModel'] as String?,
        vehiclePlate: j['vehiclePlate'] as String?,
        vehicleColor: j['vehicleColor'] as String?,
        ratingAvg: _double(j['ratingAvg']),
        ratingCount: _int(j['ratingCount']),
        zoneId: (j['zone'] as Json?)?['id'] as String?,
        zoneName: (j['zone'] as Json?)?['name'] as String?,
        payoutMethod: j['payoutMethod'] as String?,
        payoutAccount: j['payoutAccount'] as String?,
        payoutAccountName: j['payoutAccountName'] as String?,
        payoutBankName: j['payoutBankName'] as String?,
      );

  final String id;
  final String? name;
  final String? photoUrl;
  final String phone;
  final String status;
  final String? rejectionReason;
  final bool isOnline;
  final String vehicleType;
  final String? vehicleMake;
  final String? vehicleModel;

  /// Zimbabwean number plate, e.g. "AEZ 1234"; null for bicycles.
  final String? vehiclePlate;
  final String? vehicleColor;
  final double ratingAvg;
  final int ratingCount;

  /// The delivery zone the rider works in; null means any zone.
  final String? zoneId;
  final String? zoneName;
  final String? payoutMethod;
  final String? payoutAccount;
  final String? payoutAccountName;
  final String? payoutBankName;

  bool get isApproved => status == 'APPROVED';
}

class RiderDashboard {
  RiderDashboard({
    required this.registered,
    this.rider,
    this.wallet,
    this.activeOrder,
    this.pendingOffer,
    this.today,
    this.week,
    this.unreadMessages = 0,
  });
  factory RiderDashboard.fromJson(Json j) {
    if (j['registered'] != true) return RiderDashboard(registered: false);
    final stats = j['stats'] as Json;
    return RiderDashboard(
      registered: true,
      rider: RiderProfile.fromJson(j['rider'] as Json),
      wallet: WalletSummary.fromJson(j['wallet'] as Json),
      activeOrder: j['activeOrder'] == null ? null : Order.fromJson(j['activeOrder'] as Json),
      pendingOffer: j['pendingOffer'] == null ? null : DispatchOffer.fromJson(j['pendingOffer'] as Json),
      today: RiderStats.fromJson(stats['today'] as Json),
      week: RiderStats.fromJson(stats['week'] as Json),
      unreadMessages: _int(j['unreadMessages']),
    );
  }
  final bool registered;
  final RiderProfile? rider;
  final WalletSummary? wallet;
  final Order? activeOrder;
  final DispatchOffer? pendingOffer;
  final RiderStats? today;
  final RiderStats? week;

  /// Messages on the active order from the customer or store that the rider hasn't read.
  final int unreadMessages;
}
