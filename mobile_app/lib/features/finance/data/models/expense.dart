class Expense {
  final String id;
  final String? category;
  final double? amount;
  final String? note;
  final String? date;
  final String? routeId;
  final String? splitType;
  final DateTime? createdAt;

  Expense({
    required this.id,
    this.category,
    this.amount,
    this.note,
    this.date,
    this.routeId,
    this.splitType,
    this.createdAt,
  });

  factory Expense.fromJson(Map<String, dynamic> json) {
    return Expense(
      id: json['id'] as String,
      category: json['category'] as String?,
      amount: (json['amount'] as num?)?.toDouble(),
      note: json['note'] as String?,
      date: json['date'] as String?,
      routeId: json['route_id'] as String?,
      splitType: json['split_type'] as String?,
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at'] as String) : null,
    );
  }
}
