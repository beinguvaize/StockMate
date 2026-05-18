class ReportParams {
  final String tenantId;
  final DateTime from;
  final DateTime to;
  const ReportParams({required this.tenantId, required this.from, required this.to});
  String get fromIso => '${from.year}-${from.month.toString().padLeft(2,'0')}-${from.day.toString().padLeft(2,'0')}';
  String get toIso   => '${to.year}-${to.month.toString().padLeft(2,'0')}-${to.day.toString().padLeft(2,'0')}';
  @override bool operator ==(Object o) => o is ReportParams && o.tenantId==tenantId && o.from==from && o.to==to;
  @override int get hashCode => Object.hash(tenantId, from, to);
}
