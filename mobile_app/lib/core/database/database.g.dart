// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $SyncMutationsTable extends SyncMutations with TableInfo<$SyncMutationsTable, SyncMutation>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$SyncMutationsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<int> id = GeneratedColumn<int>('id', aliasedName, false, hasAutoIncrement: true, type: DriftSqlType.int, requiredDuringInsert: false, defaultConstraints: GeneratedColumn.constraintIsAlways('PRIMARY KEY AUTOINCREMENT'));
static const VerificationMeta _targetTableMeta = const VerificationMeta('targetTable');
@override
late final GeneratedColumn<String> targetTable = GeneratedColumn<String>('target_table', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _actionMeta = const VerificationMeta('action');
@override
late final GeneratedColumn<String> action = GeneratedColumn<String>('action', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _payloadMeta = const VerificationMeta('payload');
@override
late final GeneratedColumn<String> payload = GeneratedColumn<String>('payload', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _rpcNameMeta = const VerificationMeta('rpcName');
@override
late final GeneratedColumn<String> rpcName = GeneratedColumn<String>('rpc_name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
@override
late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>('created_at', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: false, defaultValue: currentDateAndTime);
static const VerificationMeta _isSyncedMeta = const VerificationMeta('isSynced');
@override
late final GeneratedColumn<bool> isSynced = GeneratedColumn<bool>('is_synced', aliasedName, false, type: DriftSqlType.bool, requiredDuringInsert: false, defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("is_synced" IN (0, 1))'), defaultValue: const Constant(false));
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: false, defaultValue: const Constant('PENDING'));
static const VerificationMeta _attemptsMeta = const VerificationMeta('attempts');
@override
late final GeneratedColumn<int> attempts = GeneratedColumn<int>('attempts', aliasedName, false, type: DriftSqlType.int, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _lastErrorMeta = const VerificationMeta('lastError');
@override
late final GeneratedColumn<String> lastError = GeneratedColumn<String>('last_error', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _nextAttemptAtMeta = const VerificationMeta('nextAttemptAt');
@override
late final GeneratedColumn<DateTime> nextAttemptAt = GeneratedColumn<DateTime>('next_attempt_at', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: false, defaultValue: currentDateAndTime);
static const VerificationMeta _lastAttemptAtMeta = const VerificationMeta('lastAttemptAt');
@override
late final GeneratedColumn<DateTime> lastAttemptAt = GeneratedColumn<DateTime>('last_attempt_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, targetTable, action, payload, rpcName, createdAt, isSynced, status, attempts, lastError, nextAttemptAt, lastAttemptAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'sync_mutations';
@override
VerificationContext validateIntegrity(Insertable<SyncMutation> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));}if (data.containsKey('target_table')) {
context.handle(_targetTableMeta, targetTable.isAcceptableOrUnknown(data['target_table']!, _targetTableMeta));} else if (isInserting) {
context.missing(_targetTableMeta);
}
if (data.containsKey('action')) {
context.handle(_actionMeta, action.isAcceptableOrUnknown(data['action']!, _actionMeta));} else if (isInserting) {
context.missing(_actionMeta);
}
if (data.containsKey('payload')) {
context.handle(_payloadMeta, payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta));} else if (isInserting) {
context.missing(_payloadMeta);
}
if (data.containsKey('rpc_name')) {
context.handle(_rpcNameMeta, rpcName.isAcceptableOrUnknown(data['rpc_name']!, _rpcNameMeta));}if (data.containsKey('created_at')) {
context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));}if (data.containsKey('is_synced')) {
context.handle(_isSyncedMeta, isSynced.isAcceptableOrUnknown(data['is_synced']!, _isSyncedMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));}if (data.containsKey('attempts')) {
context.handle(_attemptsMeta, attempts.isAcceptableOrUnknown(data['attempts']!, _attemptsMeta));}if (data.containsKey('last_error')) {
context.handle(_lastErrorMeta, lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta));}if (data.containsKey('next_attempt_at')) {
context.handle(_nextAttemptAtMeta, nextAttemptAt.isAcceptableOrUnknown(data['next_attempt_at']!, _nextAttemptAtMeta));}if (data.containsKey('last_attempt_at')) {
context.handle(_lastAttemptAtMeta, lastAttemptAt.isAcceptableOrUnknown(data['last_attempt_at']!, _lastAttemptAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override SyncMutation map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return SyncMutation(id: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}id'])!, targetTable: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}target_table'])!, action: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}action'])!, payload: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payload'])!, rpcName: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}rpc_name']), createdAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!, isSynced: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}is_synced'])!, status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!, attempts: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}attempts'])!, lastError: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}last_error']), nextAttemptAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}next_attempt_at'])!, lastAttemptAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}last_attempt_at']), );
}
@override
$SyncMutationsTable createAlias(String alias) {
return $SyncMutationsTable(attachedDatabase, alias);}}class SyncMutation extends DataClass implements Insertable<SyncMutation> 
{
final int id;
final String targetTable;
final String action;
final String payload;
final String? rpcName;
final DateTime createdAt;
final bool isSynced;
final String status;
final int attempts;
final String? lastError;
final DateTime nextAttemptAt;
final DateTime? lastAttemptAt;
const SyncMutation({required this.id, required this.targetTable, required this.action, required this.payload, this.rpcName, required this.createdAt, required this.isSynced, required this.status, required this.attempts, this.lastError, required this.nextAttemptAt, this.lastAttemptAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<int>(id);
map['target_table'] = Variable<String>(targetTable);
map['action'] = Variable<String>(action);
map['payload'] = Variable<String>(payload);
if (!nullToAbsent || rpcName != null){map['rpc_name'] = Variable<String>(rpcName);
}map['created_at'] = Variable<DateTime>(createdAt);
map['is_synced'] = Variable<bool>(isSynced);
map['status'] = Variable<String>(status);
map['attempts'] = Variable<int>(attempts);
if (!nullToAbsent || lastError != null){map['last_error'] = Variable<String>(lastError);
}map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt);
if (!nullToAbsent || lastAttemptAt != null){map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt);
}return map; 
}
SyncMutationsCompanion toCompanion(bool nullToAbsent) {
return SyncMutationsCompanion(id: Value(id),targetTable: Value(targetTable),action: Value(action),payload: Value(payload),rpcName: rpcName == null && nullToAbsent ? const Value.absent() : Value(rpcName),createdAt: Value(createdAt),isSynced: Value(isSynced),status: Value(status),attempts: Value(attempts),lastError: lastError == null && nullToAbsent ? const Value.absent() : Value(lastError),nextAttemptAt: Value(nextAttemptAt),lastAttemptAt: lastAttemptAt == null && nullToAbsent ? const Value.absent() : Value(lastAttemptAt),);
}
factory SyncMutation.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return SyncMutation(id: serializer.fromJson<int>(json['id']),targetTable: serializer.fromJson<String>(json['targetTable']),action: serializer.fromJson<String>(json['action']),payload: serializer.fromJson<String>(json['payload']),rpcName: serializer.fromJson<String?>(json['rpcName']),createdAt: serializer.fromJson<DateTime>(json['createdAt']),isSynced: serializer.fromJson<bool>(json['isSynced']),status: serializer.fromJson<String>(json['status']),attempts: serializer.fromJson<int>(json['attempts']),lastError: serializer.fromJson<String?>(json['lastError']),nextAttemptAt: serializer.fromJson<DateTime>(json['nextAttemptAt']),lastAttemptAt: serializer.fromJson<DateTime?>(json['lastAttemptAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<int>(id),'targetTable': serializer.toJson<String>(targetTable),'action': serializer.toJson<String>(action),'payload': serializer.toJson<String>(payload),'rpcName': serializer.toJson<String?>(rpcName),'createdAt': serializer.toJson<DateTime>(createdAt),'isSynced': serializer.toJson<bool>(isSynced),'status': serializer.toJson<String>(status),'attempts': serializer.toJson<int>(attempts),'lastError': serializer.toJson<String?>(lastError),'nextAttemptAt': serializer.toJson<DateTime>(nextAttemptAt),'lastAttemptAt': serializer.toJson<DateTime?>(lastAttemptAt),};}SyncMutation copyWith({int? id,String? targetTable,String? action,String? payload,Value<String?> rpcName = const Value.absent(),DateTime? createdAt,bool? isSynced,String? status,int? attempts,Value<String?> lastError = const Value.absent(),DateTime? nextAttemptAt,Value<DateTime?> lastAttemptAt = const Value.absent()}) => SyncMutation(id: id ?? this.id,targetTable: targetTable ?? this.targetTable,action: action ?? this.action,payload: payload ?? this.payload,rpcName: rpcName.present ? rpcName.value : this.rpcName,createdAt: createdAt ?? this.createdAt,isSynced: isSynced ?? this.isSynced,status: status ?? this.status,attempts: attempts ?? this.attempts,lastError: lastError.present ? lastError.value : this.lastError,nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,lastAttemptAt: lastAttemptAt.present ? lastAttemptAt.value : this.lastAttemptAt,);SyncMutation copyWithCompanion(SyncMutationsCompanion data) {
return SyncMutation(
id: data.id.present ? data.id.value : this.id,targetTable: data.targetTable.present ? data.targetTable.value : this.targetTable,action: data.action.present ? data.action.value : this.action,payload: data.payload.present ? data.payload.value : this.payload,rpcName: data.rpcName.present ? data.rpcName.value : this.rpcName,createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,isSynced: data.isSynced.present ? data.isSynced.value : this.isSynced,status: data.status.present ? data.status.value : this.status,attempts: data.attempts.present ? data.attempts.value : this.attempts,lastError: data.lastError.present ? data.lastError.value : this.lastError,nextAttemptAt: data.nextAttemptAt.present ? data.nextAttemptAt.value : this.nextAttemptAt,lastAttemptAt: data.lastAttemptAt.present ? data.lastAttemptAt.value : this.lastAttemptAt,);
}
@override
String toString() {return (StringBuffer('SyncMutation(')..write('id: $id, ')..write('targetTable: $targetTable, ')..write('action: $action, ')..write('payload: $payload, ')..write('rpcName: $rpcName, ')..write('createdAt: $createdAt, ')..write('isSynced: $isSynced, ')..write('status: $status, ')..write('attempts: $attempts, ')..write('lastError: $lastError, ')..write('nextAttemptAt: $nextAttemptAt, ')..write('lastAttemptAt: $lastAttemptAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, targetTable, action, payload, rpcName, createdAt, isSynced, status, attempts, lastError, nextAttemptAt, lastAttemptAt);@override
bool operator ==(Object other) => identical(this, other) || (other is SyncMutation && other.id == this.id && other.targetTable == this.targetTable && other.action == this.action && other.payload == this.payload && other.rpcName == this.rpcName && other.createdAt == this.createdAt && other.isSynced == this.isSynced && other.status == this.status && other.attempts == this.attempts && other.lastError == this.lastError && other.nextAttemptAt == this.nextAttemptAt && other.lastAttemptAt == this.lastAttemptAt);
}class SyncMutationsCompanion extends UpdateCompanion<SyncMutation> {
final Value<int> id;
final Value<String> targetTable;
final Value<String> action;
final Value<String> payload;
final Value<String?> rpcName;
final Value<DateTime> createdAt;
final Value<bool> isSynced;
final Value<String> status;
final Value<int> attempts;
final Value<String?> lastError;
final Value<DateTime> nextAttemptAt;
final Value<DateTime?> lastAttemptAt;
const SyncMutationsCompanion({this.id = const Value.absent(),this.targetTable = const Value.absent(),this.action = const Value.absent(),this.payload = const Value.absent(),this.rpcName = const Value.absent(),this.createdAt = const Value.absent(),this.isSynced = const Value.absent(),this.status = const Value.absent(),this.attempts = const Value.absent(),this.lastError = const Value.absent(),this.nextAttemptAt = const Value.absent(),this.lastAttemptAt = const Value.absent(),});
SyncMutationsCompanion.insert({this.id = const Value.absent(),required String targetTable,required String action,required String payload,this.rpcName = const Value.absent(),this.createdAt = const Value.absent(),this.isSynced = const Value.absent(),this.status = const Value.absent(),this.attempts = const Value.absent(),this.lastError = const Value.absent(),this.nextAttemptAt = const Value.absent(),this.lastAttemptAt = const Value.absent(),}): targetTable = Value(targetTable), action = Value(action), payload = Value(payload);
static Insertable<SyncMutation> custom({Expression<int>? id, 
Expression<String>? targetTable, 
Expression<String>? action, 
Expression<String>? payload, 
Expression<String>? rpcName, 
Expression<DateTime>? createdAt, 
Expression<bool>? isSynced, 
Expression<String>? status, 
Expression<int>? attempts, 
Expression<String>? lastError, 
Expression<DateTime>? nextAttemptAt, 
Expression<DateTime>? lastAttemptAt, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (targetTable != null)'target_table': targetTable,if (action != null)'action': action,if (payload != null)'payload': payload,if (rpcName != null)'rpc_name': rpcName,if (createdAt != null)'created_at': createdAt,if (isSynced != null)'is_synced': isSynced,if (status != null)'status': status,if (attempts != null)'attempts': attempts,if (lastError != null)'last_error': lastError,if (nextAttemptAt != null)'next_attempt_at': nextAttemptAt,if (lastAttemptAt != null)'last_attempt_at': lastAttemptAt,});
}SyncMutationsCompanion copyWith({Value<int>? id, Value<String>? targetTable, Value<String>? action, Value<String>? payload, Value<String?>? rpcName, Value<DateTime>? createdAt, Value<bool>? isSynced, Value<String>? status, Value<int>? attempts, Value<String?>? lastError, Value<DateTime>? nextAttemptAt, Value<DateTime?>? lastAttemptAt}) {
return SyncMutationsCompanion(id: id ?? this.id,targetTable: targetTable ?? this.targetTable,action: action ?? this.action,payload: payload ?? this.payload,rpcName: rpcName ?? this.rpcName,createdAt: createdAt ?? this.createdAt,isSynced: isSynced ?? this.isSynced,status: status ?? this.status,attempts: attempts ?? this.attempts,lastError: lastError ?? this.lastError,nextAttemptAt: nextAttemptAt ?? this.nextAttemptAt,lastAttemptAt: lastAttemptAt ?? this.lastAttemptAt,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<int>(id.value);}
if (targetTable.present) {
map['target_table'] = Variable<String>(targetTable.value);}
if (action.present) {
map['action'] = Variable<String>(action.value);}
if (payload.present) {
map['payload'] = Variable<String>(payload.value);}
if (rpcName.present) {
map['rpc_name'] = Variable<String>(rpcName.value);}
if (createdAt.present) {
map['created_at'] = Variable<DateTime>(createdAt.value);}
if (isSynced.present) {
map['is_synced'] = Variable<bool>(isSynced.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (attempts.present) {
map['attempts'] = Variable<int>(attempts.value);}
if (lastError.present) {
map['last_error'] = Variable<String>(lastError.value);}
if (nextAttemptAt.present) {
map['next_attempt_at'] = Variable<DateTime>(nextAttemptAt.value);}
if (lastAttemptAt.present) {
map['last_attempt_at'] = Variable<DateTime>(lastAttemptAt.value);}
return map; 
}
@override
String toString() {return (StringBuffer('SyncMutationsCompanion(')..write('id: $id, ')..write('targetTable: $targetTable, ')..write('action: $action, ')..write('payload: $payload, ')..write('rpcName: $rpcName, ')..write('createdAt: $createdAt, ')..write('isSynced: $isSynced, ')..write('status: $status, ')..write('attempts: $attempts, ')..write('lastError: $lastError, ')..write('nextAttemptAt: $nextAttemptAt, ')..write('lastAttemptAt: $lastAttemptAt')..write(')')).toString();}
}
class $TenantsTable extends Tenants with TableInfo<$TenantsTable, Tenant>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$TenantsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _slugMeta = const VerificationMeta('slug');
@override
late final GeneratedColumn<String> slug = GeneratedColumn<String>('slug', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _planMeta = const VerificationMeta('plan');
@override
late final GeneratedColumn<String> plan = GeneratedColumn<String>('plan', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
@override
late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>('created_at', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: true);
@override
List<GeneratedColumn> get $columns => [id, name, slug, plan, status, createdAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'tenants';
@override
VerificationContext validateIntegrity(Insertable<Tenant> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));} else if (isInserting) {
context.missing(_nameMeta);
}
if (data.containsKey('slug')) {
context.handle(_slugMeta, slug.isAcceptableOrUnknown(data['slug']!, _slugMeta));} else if (isInserting) {
context.missing(_slugMeta);
}
if (data.containsKey('plan')) {
context.handle(_planMeta, plan.isAcceptableOrUnknown(data['plan']!, _planMeta));} else if (isInserting) {
context.missing(_planMeta);
}
if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));} else if (isInserting) {
context.missing(_statusMeta);
}
if (data.containsKey('created_at')) {
context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));} else if (isInserting) {
context.missing(_createdAtMeta);
}
return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Tenant map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Tenant(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!, slug: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}slug'])!, plan: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}plan'])!, status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!, createdAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}created_at'])!, );
}
@override
$TenantsTable createAlias(String alias) {
return $TenantsTable(attachedDatabase, alias);}}class Tenant extends DataClass implements Insertable<Tenant> 
{
final String id;
final String name;
final String slug;
final String plan;
final String status;
final DateTime createdAt;
const Tenant({required this.id, required this.name, required this.slug, required this.plan, required this.status, required this.createdAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['name'] = Variable<String>(name);
map['slug'] = Variable<String>(slug);
map['plan'] = Variable<String>(plan);
map['status'] = Variable<String>(status);
map['created_at'] = Variable<DateTime>(createdAt);
return map; 
}
TenantsCompanion toCompanion(bool nullToAbsent) {
return TenantsCompanion(id: Value(id),name: Value(name),slug: Value(slug),plan: Value(plan),status: Value(status),createdAt: Value(createdAt),);
}
factory Tenant.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Tenant(id: serializer.fromJson<String>(json['id']),name: serializer.fromJson<String>(json['name']),slug: serializer.fromJson<String>(json['slug']),plan: serializer.fromJson<String>(json['plan']),status: serializer.fromJson<String>(json['status']),createdAt: serializer.fromJson<DateTime>(json['createdAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'name': serializer.toJson<String>(name),'slug': serializer.toJson<String>(slug),'plan': serializer.toJson<String>(plan),'status': serializer.toJson<String>(status),'createdAt': serializer.toJson<DateTime>(createdAt),};}Tenant copyWith({String? id,String? name,String? slug,String? plan,String? status,DateTime? createdAt}) => Tenant(id: id ?? this.id,name: name ?? this.name,slug: slug ?? this.slug,plan: plan ?? this.plan,status: status ?? this.status,createdAt: createdAt ?? this.createdAt,);Tenant copyWithCompanion(TenantsCompanion data) {
return Tenant(
id: data.id.present ? data.id.value : this.id,name: data.name.present ? data.name.value : this.name,slug: data.slug.present ? data.slug.value : this.slug,plan: data.plan.present ? data.plan.value : this.plan,status: data.status.present ? data.status.value : this.status,createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,);
}
@override
String toString() {return (StringBuffer('Tenant(')..write('id: $id, ')..write('name: $name, ')..write('slug: $slug, ')..write('plan: $plan, ')..write('status: $status, ')..write('createdAt: $createdAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, name, slug, plan, status, createdAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Tenant && other.id == this.id && other.name == this.name && other.slug == this.slug && other.plan == this.plan && other.status == this.status && other.createdAt == this.createdAt);
}class TenantsCompanion extends UpdateCompanion<Tenant> {
final Value<String> id;
final Value<String> name;
final Value<String> slug;
final Value<String> plan;
final Value<String> status;
final Value<DateTime> createdAt;
final Value<int> rowid;
const TenantsCompanion({this.id = const Value.absent(),this.name = const Value.absent(),this.slug = const Value.absent(),this.plan = const Value.absent(),this.status = const Value.absent(),this.createdAt = const Value.absent(),this.rowid = const Value.absent(),});
TenantsCompanion.insert({required String id,required String name,required String slug,required String plan,required String status,required DateTime createdAt,this.rowid = const Value.absent(),}): id = Value(id), name = Value(name), slug = Value(slug), plan = Value(plan), status = Value(status), createdAt = Value(createdAt);
static Insertable<Tenant> custom({Expression<String>? id, 
Expression<String>? name, 
Expression<String>? slug, 
Expression<String>? plan, 
Expression<String>? status, 
Expression<DateTime>? createdAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (name != null)'name': name,if (slug != null)'slug': slug,if (plan != null)'plan': plan,if (status != null)'status': status,if (createdAt != null)'created_at': createdAt,if (rowid != null)'rowid': rowid,});
}TenantsCompanion copyWith({Value<String>? id, Value<String>? name, Value<String>? slug, Value<String>? plan, Value<String>? status, Value<DateTime>? createdAt, Value<int>? rowid}) {
return TenantsCompanion(id: id ?? this.id,name: name ?? this.name,slug: slug ?? this.slug,plan: plan ?? this.plan,status: status ?? this.status,createdAt: createdAt ?? this.createdAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (slug.present) {
map['slug'] = Variable<String>(slug.value);}
if (plan.present) {
map['plan'] = Variable<String>(plan.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (createdAt.present) {
map['created_at'] = Variable<DateTime>(createdAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('TenantsCompanion(')..write('id: $id, ')..write('name: $name, ')..write('slug: $slug, ')..write('plan: $plan, ')..write('status: $status, ')..write('createdAt: $createdAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $ProductsTable extends Products with TableInfo<$ProductsTable, Product>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$ProductsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _skuMeta = const VerificationMeta('sku');
@override
late final GeneratedColumn<String> sku = GeneratedColumn<String>('sku', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _categoryMeta = const VerificationMeta('category');
@override
late final GeneratedColumn<String> category = GeneratedColumn<String>('category', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _unitMeta = const VerificationMeta('unit');
@override
late final GeneratedColumn<String> unit = GeneratedColumn<String>('unit', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _secondaryUnitMeta = const VerificationMeta('secondaryUnit');
@override
late final GeneratedColumn<String> secondaryUnit = GeneratedColumn<String>('secondary_unit', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _conversionFactorMeta = const VerificationMeta('conversionFactor');
@override
late final GeneratedColumn<double> conversionFactor = GeneratedColumn<double>('conversion_factor', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _costPriceMeta = const VerificationMeta('costPrice');
@override
late final GeneratedColumn<double> costPrice = GeneratedColumn<double>('cost_price', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _sellingPriceMeta = const VerificationMeta('sellingPrice');
@override
late final GeneratedColumn<double> sellingPrice = GeneratedColumn<double>('selling_price', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _stockMeta = const VerificationMeta('stock');
@override
late final GeneratedColumn<double> stock = GeneratedColumn<double>('stock', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _taxRateMeta = const VerificationMeta('taxRate');
@override
late final GeneratedColumn<double> taxRate = GeneratedColumn<double>('tax_rate', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _cessRateMeta = const VerificationMeta('cessRate');
@override
late final GeneratedColumn<double> cessRate = GeneratedColumn<double>('cess_rate', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _hsnCodeMeta = const VerificationMeta('hsnCode');
@override
late final GeneratedColumn<String> hsnCode = GeneratedColumn<String>('hsn_code', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _imageMeta = const VerificationMeta('image');
@override
late final GeneratedColumn<String> image = GeneratedColumn<String>('image', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, sku, name, category, unit, secondaryUnit, conversionFactor, costPrice, sellingPrice, stock, taxRate, cessRate, hsnCode, image, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'products';
@override
VerificationContext validateIntegrity(Insertable<Product> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('sku')) {
context.handle(_skuMeta, sku.isAcceptableOrUnknown(data['sku']!, _skuMeta));}if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));} else if (isInserting) {
context.missing(_nameMeta);
}
if (data.containsKey('category')) {
context.handle(_categoryMeta, category.isAcceptableOrUnknown(data['category']!, _categoryMeta));}if (data.containsKey('unit')) {
context.handle(_unitMeta, unit.isAcceptableOrUnknown(data['unit']!, _unitMeta));}if (data.containsKey('secondary_unit')) {
context.handle(_secondaryUnitMeta, secondaryUnit.isAcceptableOrUnknown(data['secondary_unit']!, _secondaryUnitMeta));}if (data.containsKey('conversion_factor')) {
context.handle(_conversionFactorMeta, conversionFactor.isAcceptableOrUnknown(data['conversion_factor']!, _conversionFactorMeta));}if (data.containsKey('cost_price')) {
context.handle(_costPriceMeta, costPrice.isAcceptableOrUnknown(data['cost_price']!, _costPriceMeta));}if (data.containsKey('selling_price')) {
context.handle(_sellingPriceMeta, sellingPrice.isAcceptableOrUnknown(data['selling_price']!, _sellingPriceMeta));}if (data.containsKey('stock')) {
context.handle(_stockMeta, stock.isAcceptableOrUnknown(data['stock']!, _stockMeta));}if (data.containsKey('tax_rate')) {
context.handle(_taxRateMeta, taxRate.isAcceptableOrUnknown(data['tax_rate']!, _taxRateMeta));}if (data.containsKey('cess_rate')) {
context.handle(_cessRateMeta, cessRate.isAcceptableOrUnknown(data['cess_rate']!, _cessRateMeta));}if (data.containsKey('hsn_code')) {
context.handle(_hsnCodeMeta, hsnCode.isAcceptableOrUnknown(data['hsn_code']!, _hsnCodeMeta));}if (data.containsKey('image')) {
context.handle(_imageMeta, image.isAcceptableOrUnknown(data['image']!, _imageMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Product map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Product(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, sku: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}sku']), name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!, category: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}category']), unit: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}unit']), secondaryUnit: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}secondary_unit']), conversionFactor: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}conversion_factor']), costPrice: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}cost_price'])!, sellingPrice: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}selling_price'])!, stock: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}stock'])!, taxRate: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}tax_rate'])!, cessRate: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}cess_rate'])!, hsnCode: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}hsn_code']), image: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}image']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$ProductsTable createAlias(String alias) {
return $ProductsTable(attachedDatabase, alias);}}class Product extends DataClass implements Insertable<Product> 
{
final String id;
final String tenantId;
final String? sku;
final String name;
final String? category;
final String? unit;
final String? secondaryUnit;
final double? conversionFactor;
final double costPrice;
final double sellingPrice;
final double stock;
final double taxRate;
final double cessRate;
final String? hsnCode;
final String? image;
final DateTime? updatedAt;
const Product({required this.id, required this.tenantId, this.sku, required this.name, this.category, this.unit, this.secondaryUnit, this.conversionFactor, required this.costPrice, required this.sellingPrice, required this.stock, required this.taxRate, required this.cessRate, this.hsnCode, this.image, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || sku != null){map['sku'] = Variable<String>(sku);
}map['name'] = Variable<String>(name);
if (!nullToAbsent || category != null){map['category'] = Variable<String>(category);
}if (!nullToAbsent || unit != null){map['unit'] = Variable<String>(unit);
}if (!nullToAbsent || secondaryUnit != null){map['secondary_unit'] = Variable<String>(secondaryUnit);
}if (!nullToAbsent || conversionFactor != null){map['conversion_factor'] = Variable<double>(conversionFactor);
}map['cost_price'] = Variable<double>(costPrice);
map['selling_price'] = Variable<double>(sellingPrice);
map['stock'] = Variable<double>(stock);
map['tax_rate'] = Variable<double>(taxRate);
map['cess_rate'] = Variable<double>(cessRate);
if (!nullToAbsent || hsnCode != null){map['hsn_code'] = Variable<String>(hsnCode);
}if (!nullToAbsent || image != null){map['image'] = Variable<String>(image);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
ProductsCompanion toCompanion(bool nullToAbsent) {
return ProductsCompanion(id: Value(id),tenantId: Value(tenantId),sku: sku == null && nullToAbsent ? const Value.absent() : Value(sku),name: Value(name),category: category == null && nullToAbsent ? const Value.absent() : Value(category),unit: unit == null && nullToAbsent ? const Value.absent() : Value(unit),secondaryUnit: secondaryUnit == null && nullToAbsent ? const Value.absent() : Value(secondaryUnit),conversionFactor: conversionFactor == null && nullToAbsent ? const Value.absent() : Value(conversionFactor),costPrice: Value(costPrice),sellingPrice: Value(sellingPrice),stock: Value(stock),taxRate: Value(taxRate),cessRate: Value(cessRate),hsnCode: hsnCode == null && nullToAbsent ? const Value.absent() : Value(hsnCode),image: image == null && nullToAbsent ? const Value.absent() : Value(image),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory Product.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Product(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),sku: serializer.fromJson<String?>(json['sku']),name: serializer.fromJson<String>(json['name']),category: serializer.fromJson<String?>(json['category']),unit: serializer.fromJson<String?>(json['unit']),secondaryUnit: serializer.fromJson<String?>(json['secondaryUnit']),conversionFactor: serializer.fromJson<double?>(json['conversionFactor']),costPrice: serializer.fromJson<double>(json['costPrice']),sellingPrice: serializer.fromJson<double>(json['sellingPrice']),stock: serializer.fromJson<double>(json['stock']),taxRate: serializer.fromJson<double>(json['taxRate']),cessRate: serializer.fromJson<double>(json['cessRate']),hsnCode: serializer.fromJson<String?>(json['hsnCode']),image: serializer.fromJson<String?>(json['image']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'sku': serializer.toJson<String?>(sku),'name': serializer.toJson<String>(name),'category': serializer.toJson<String?>(category),'unit': serializer.toJson<String?>(unit),'secondaryUnit': serializer.toJson<String?>(secondaryUnit),'conversionFactor': serializer.toJson<double?>(conversionFactor),'costPrice': serializer.toJson<double>(costPrice),'sellingPrice': serializer.toJson<double>(sellingPrice),'stock': serializer.toJson<double>(stock),'taxRate': serializer.toJson<double>(taxRate),'cessRate': serializer.toJson<double>(cessRate),'hsnCode': serializer.toJson<String?>(hsnCode),'image': serializer.toJson<String?>(image),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}Product copyWith({String? id,String? tenantId,Value<String?> sku = const Value.absent(),String? name,Value<String?> category = const Value.absent(),Value<String?> unit = const Value.absent(),Value<String?> secondaryUnit = const Value.absent(),Value<double?> conversionFactor = const Value.absent(),double? costPrice,double? sellingPrice,double? stock,double? taxRate,double? cessRate,Value<String?> hsnCode = const Value.absent(),Value<String?> image = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => Product(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,sku: sku.present ? sku.value : this.sku,name: name ?? this.name,category: category.present ? category.value : this.category,unit: unit.present ? unit.value : this.unit,secondaryUnit: secondaryUnit.present ? secondaryUnit.value : this.secondaryUnit,conversionFactor: conversionFactor.present ? conversionFactor.value : this.conversionFactor,costPrice: costPrice ?? this.costPrice,sellingPrice: sellingPrice ?? this.sellingPrice,stock: stock ?? this.stock,taxRate: taxRate ?? this.taxRate,cessRate: cessRate ?? this.cessRate,hsnCode: hsnCode.present ? hsnCode.value : this.hsnCode,image: image.present ? image.value : this.image,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);Product copyWithCompanion(ProductsCompanion data) {
return Product(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,sku: data.sku.present ? data.sku.value : this.sku,name: data.name.present ? data.name.value : this.name,category: data.category.present ? data.category.value : this.category,unit: data.unit.present ? data.unit.value : this.unit,secondaryUnit: data.secondaryUnit.present ? data.secondaryUnit.value : this.secondaryUnit,conversionFactor: data.conversionFactor.present ? data.conversionFactor.value : this.conversionFactor,costPrice: data.costPrice.present ? data.costPrice.value : this.costPrice,sellingPrice: data.sellingPrice.present ? data.sellingPrice.value : this.sellingPrice,stock: data.stock.present ? data.stock.value : this.stock,taxRate: data.taxRate.present ? data.taxRate.value : this.taxRate,cessRate: data.cessRate.present ? data.cessRate.value : this.cessRate,hsnCode: data.hsnCode.present ? data.hsnCode.value : this.hsnCode,image: data.image.present ? data.image.value : this.image,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('Product(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('sku: $sku, ')..write('name: $name, ')..write('category: $category, ')..write('unit: $unit, ')..write('secondaryUnit: $secondaryUnit, ')..write('conversionFactor: $conversionFactor, ')..write('costPrice: $costPrice, ')..write('sellingPrice: $sellingPrice, ')..write('stock: $stock, ')..write('taxRate: $taxRate, ')..write('cessRate: $cessRate, ')..write('hsnCode: $hsnCode, ')..write('image: $image, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, sku, name, category, unit, secondaryUnit, conversionFactor, costPrice, sellingPrice, stock, taxRate, cessRate, hsnCode, image, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Product && other.id == this.id && other.tenantId == this.tenantId && other.sku == this.sku && other.name == this.name && other.category == this.category && other.unit == this.unit && other.secondaryUnit == this.secondaryUnit && other.conversionFactor == this.conversionFactor && other.costPrice == this.costPrice && other.sellingPrice == this.sellingPrice && other.stock == this.stock && other.taxRate == this.taxRate && other.cessRate == this.cessRate && other.hsnCode == this.hsnCode && other.image == this.image && other.updatedAt == this.updatedAt);
}class ProductsCompanion extends UpdateCompanion<Product> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> sku;
final Value<String> name;
final Value<String?> category;
final Value<String?> unit;
final Value<String?> secondaryUnit;
final Value<double?> conversionFactor;
final Value<double> costPrice;
final Value<double> sellingPrice;
final Value<double> stock;
final Value<double> taxRate;
final Value<double> cessRate;
final Value<String?> hsnCode;
final Value<String?> image;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const ProductsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.sku = const Value.absent(),this.name = const Value.absent(),this.category = const Value.absent(),this.unit = const Value.absent(),this.secondaryUnit = const Value.absent(),this.conversionFactor = const Value.absent(),this.costPrice = const Value.absent(),this.sellingPrice = const Value.absent(),this.stock = const Value.absent(),this.taxRate = const Value.absent(),this.cessRate = const Value.absent(),this.hsnCode = const Value.absent(),this.image = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
ProductsCompanion.insert({required String id,required String tenantId,this.sku = const Value.absent(),required String name,this.category = const Value.absent(),this.unit = const Value.absent(),this.secondaryUnit = const Value.absent(),this.conversionFactor = const Value.absent(),this.costPrice = const Value.absent(),this.sellingPrice = const Value.absent(),this.stock = const Value.absent(),this.taxRate = const Value.absent(),this.cessRate = const Value.absent(),this.hsnCode = const Value.absent(),this.image = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), name = Value(name);
static Insertable<Product> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? sku, 
Expression<String>? name, 
Expression<String>? category, 
Expression<String>? unit, 
Expression<String>? secondaryUnit, 
Expression<double>? conversionFactor, 
Expression<double>? costPrice, 
Expression<double>? sellingPrice, 
Expression<double>? stock, 
Expression<double>? taxRate, 
Expression<double>? cessRate, 
Expression<String>? hsnCode, 
Expression<String>? image, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (sku != null)'sku': sku,if (name != null)'name': name,if (category != null)'category': category,if (unit != null)'unit': unit,if (secondaryUnit != null)'secondary_unit': secondaryUnit,if (conversionFactor != null)'conversion_factor': conversionFactor,if (costPrice != null)'cost_price': costPrice,if (sellingPrice != null)'selling_price': sellingPrice,if (stock != null)'stock': stock,if (taxRate != null)'tax_rate': taxRate,if (cessRate != null)'cess_rate': cessRate,if (hsnCode != null)'hsn_code': hsnCode,if (image != null)'image': image,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}ProductsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? sku, Value<String>? name, Value<String?>? category, Value<String?>? unit, Value<String?>? secondaryUnit, Value<double?>? conversionFactor, Value<double>? costPrice, Value<double>? sellingPrice, Value<double>? stock, Value<double>? taxRate, Value<double>? cessRate, Value<String?>? hsnCode, Value<String?>? image, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return ProductsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,sku: sku ?? this.sku,name: name ?? this.name,category: category ?? this.category,unit: unit ?? this.unit,secondaryUnit: secondaryUnit ?? this.secondaryUnit,conversionFactor: conversionFactor ?? this.conversionFactor,costPrice: costPrice ?? this.costPrice,sellingPrice: sellingPrice ?? this.sellingPrice,stock: stock ?? this.stock,taxRate: taxRate ?? this.taxRate,cessRate: cessRate ?? this.cessRate,hsnCode: hsnCode ?? this.hsnCode,image: image ?? this.image,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (sku.present) {
map['sku'] = Variable<String>(sku.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (category.present) {
map['category'] = Variable<String>(category.value);}
if (unit.present) {
map['unit'] = Variable<String>(unit.value);}
if (secondaryUnit.present) {
map['secondary_unit'] = Variable<String>(secondaryUnit.value);}
if (conversionFactor.present) {
map['conversion_factor'] = Variable<double>(conversionFactor.value);}
if (costPrice.present) {
map['cost_price'] = Variable<double>(costPrice.value);}
if (sellingPrice.present) {
map['selling_price'] = Variable<double>(sellingPrice.value);}
if (stock.present) {
map['stock'] = Variable<double>(stock.value);}
if (taxRate.present) {
map['tax_rate'] = Variable<double>(taxRate.value);}
if (cessRate.present) {
map['cess_rate'] = Variable<double>(cessRate.value);}
if (hsnCode.present) {
map['hsn_code'] = Variable<String>(hsnCode.value);}
if (image.present) {
map['image'] = Variable<String>(image.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('ProductsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('sku: $sku, ')..write('name: $name, ')..write('category: $category, ')..write('unit: $unit, ')..write('secondaryUnit: $secondaryUnit, ')..write('conversionFactor: $conversionFactor, ')..write('costPrice: $costPrice, ')..write('sellingPrice: $sellingPrice, ')..write('stock: $stock, ')..write('taxRate: $taxRate, ')..write('cessRate: $cessRate, ')..write('hsnCode: $hsnCode, ')..write('image: $image, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $ClientsTable extends Clients with TableInfo<$ClientsTable, Client>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$ClientsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _emailMeta = const VerificationMeta('email');
@override
late final GeneratedColumn<String> email = GeneratedColumn<String>('email', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _phoneMeta = const VerificationMeta('phone');
@override
late final GeneratedColumn<String> phone = GeneratedColumn<String>('phone', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _addressMeta = const VerificationMeta('address');
@override
late final GeneratedColumn<String> address = GeneratedColumn<String>('address', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _balanceMeta = const VerificationMeta('balance');
@override
late final GeneratedColumn<double> balance = GeneratedColumn<double>('balance', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _outstandingBalanceMeta = const VerificationMeta('outstandingBalance');
@override
late final GeneratedColumn<double> outstandingBalance = GeneratedColumn<double>('outstanding_balance', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, email, phone, address, balance, outstandingBalance, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'clients';
@override
VerificationContext validateIntegrity(Insertable<Client> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));} else if (isInserting) {
context.missing(_nameMeta);
}
if (data.containsKey('email')) {
context.handle(_emailMeta, email.isAcceptableOrUnknown(data['email']!, _emailMeta));}if (data.containsKey('phone')) {
context.handle(_phoneMeta, phone.isAcceptableOrUnknown(data['phone']!, _phoneMeta));}if (data.containsKey('address')) {
context.handle(_addressMeta, address.isAcceptableOrUnknown(data['address']!, _addressMeta));}if (data.containsKey('balance')) {
context.handle(_balanceMeta, balance.isAcceptableOrUnknown(data['balance']!, _balanceMeta));}if (data.containsKey('outstanding_balance')) {
context.handle(_outstandingBalanceMeta, outstandingBalance.isAcceptableOrUnknown(data['outstanding_balance']!, _outstandingBalanceMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Client map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Client(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!, email: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}email']), phone: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}phone']), address: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}address']), balance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}balance'])!, outstandingBalance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}outstanding_balance'])!, updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$ClientsTable createAlias(String alias) {
return $ClientsTable(attachedDatabase, alias);}}class Client extends DataClass implements Insertable<Client> 
{
final String id;
final String tenantId;
final String name;
final String? email;
final String? phone;
final String? address;
final double balance;
final double outstandingBalance;
final DateTime? updatedAt;
const Client({required this.id, required this.tenantId, required this.name, this.email, this.phone, this.address, required this.balance, required this.outstandingBalance, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['name'] = Variable<String>(name);
if (!nullToAbsent || email != null){map['email'] = Variable<String>(email);
}if (!nullToAbsent || phone != null){map['phone'] = Variable<String>(phone);
}if (!nullToAbsent || address != null){map['address'] = Variable<String>(address);
}map['balance'] = Variable<double>(balance);
map['outstanding_balance'] = Variable<double>(outstandingBalance);
if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
ClientsCompanion toCompanion(bool nullToAbsent) {
return ClientsCompanion(id: Value(id),tenantId: Value(tenantId),name: Value(name),email: email == null && nullToAbsent ? const Value.absent() : Value(email),phone: phone == null && nullToAbsent ? const Value.absent() : Value(phone),address: address == null && nullToAbsent ? const Value.absent() : Value(address),balance: Value(balance),outstandingBalance: Value(outstandingBalance),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory Client.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Client(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String>(json['name']),email: serializer.fromJson<String?>(json['email']),phone: serializer.fromJson<String?>(json['phone']),address: serializer.fromJson<String?>(json['address']),balance: serializer.fromJson<double>(json['balance']),outstandingBalance: serializer.fromJson<double>(json['outstandingBalance']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String>(name),'email': serializer.toJson<String?>(email),'phone': serializer.toJson<String?>(phone),'address': serializer.toJson<String?>(address),'balance': serializer.toJson<double>(balance),'outstandingBalance': serializer.toJson<double>(outstandingBalance),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}Client copyWith({String? id,String? tenantId,String? name,Value<String?> email = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> address = const Value.absent(),double? balance,double? outstandingBalance,Value<DateTime?> updatedAt = const Value.absent()}) => Client(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,email: email.present ? email.value : this.email,phone: phone.present ? phone.value : this.phone,address: address.present ? address.value : this.address,balance: balance ?? this.balance,outstandingBalance: outstandingBalance ?? this.outstandingBalance,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);Client copyWithCompanion(ClientsCompanion data) {
return Client(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,email: data.email.present ? data.email.value : this.email,phone: data.phone.present ? data.phone.value : this.phone,address: data.address.present ? data.address.value : this.address,balance: data.balance.present ? data.balance.value : this.balance,outstandingBalance: data.outstandingBalance.present ? data.outstandingBalance.value : this.outstandingBalance,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('Client(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('email: $email, ')..write('phone: $phone, ')..write('address: $address, ')..write('balance: $balance, ')..write('outstandingBalance: $outstandingBalance, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, email, phone, address, balance, outstandingBalance, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Client && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.email == this.email && other.phone == this.phone && other.address == this.address && other.balance == this.balance && other.outstandingBalance == this.outstandingBalance && other.updatedAt == this.updatedAt);
}class ClientsCompanion extends UpdateCompanion<Client> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> name;
final Value<String?> email;
final Value<String?> phone;
final Value<String?> address;
final Value<double> balance;
final Value<double> outstandingBalance;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const ClientsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.email = const Value.absent(),this.phone = const Value.absent(),this.address = const Value.absent(),this.balance = const Value.absent(),this.outstandingBalance = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
ClientsCompanion.insert({required String id,required String tenantId,required String name,this.email = const Value.absent(),this.phone = const Value.absent(),this.address = const Value.absent(),this.balance = const Value.absent(),this.outstandingBalance = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), name = Value(name);
static Insertable<Client> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? email, 
Expression<String>? phone, 
Expression<String>? address, 
Expression<double>? balance, 
Expression<double>? outstandingBalance, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (email != null)'email': email,if (phone != null)'phone': phone,if (address != null)'address': address,if (balance != null)'balance': balance,if (outstandingBalance != null)'outstanding_balance': outstandingBalance,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}ClientsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? name, Value<String?>? email, Value<String?>? phone, Value<String?>? address, Value<double>? balance, Value<double>? outstandingBalance, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return ClientsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,email: email ?? this.email,phone: phone ?? this.phone,address: address ?? this.address,balance: balance ?? this.balance,outstandingBalance: outstandingBalance ?? this.outstandingBalance,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (email.present) {
map['email'] = Variable<String>(email.value);}
if (phone.present) {
map['phone'] = Variable<String>(phone.value);}
if (address.present) {
map['address'] = Variable<String>(address.value);}
if (balance.present) {
map['balance'] = Variable<double>(balance.value);}
if (outstandingBalance.present) {
map['outstanding_balance'] = Variable<double>(outstandingBalance.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('ClientsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('email: $email, ')..write('phone: $phone, ')..write('address: $address, ')..write('balance: $balance, ')..write('outstandingBalance: $outstandingBalance, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $SalesTable extends Sales with TableInfo<$SalesTable, Sale>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$SalesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _clientIdMeta = const VerificationMeta('clientId');
@override
late final GeneratedColumn<String> clientId = GeneratedColumn<String>('client_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _paymentMethodMeta = const VerificationMeta('paymentMethod');
@override
late final GeneratedColumn<String> paymentMethod = GeneratedColumn<String>('payment_method', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _paymentStatusMeta = const VerificationMeta('paymentStatus');
@override
late final GeneratedColumn<String> paymentStatus = GeneratedColumn<String>('payment_status', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _subtotalMeta = const VerificationMeta('subtotal');
@override
late final GeneratedColumn<double> subtotal = GeneratedColumn<double>('subtotal', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _taxMeta = const VerificationMeta('tax');
@override
late final GeneratedColumn<double> tax = GeneratedColumn<double>('tax', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _totalAmountMeta = const VerificationMeta('totalAmount');
@override
late final GeneratedColumn<double> totalAmount = GeneratedColumn<double>('total_amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _paidAmountMeta = const VerificationMeta('paidAmount');
@override
late final GeneratedColumn<double> paidAmount = GeneratedColumn<double>('paid_amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<DateTime> date = GeneratedColumn<DateTime>('date', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: true);
static const VerificationMeta _itemsJsonMeta = const VerificationMeta('itemsJson');
@override
late final GeneratedColumn<String> itemsJson = GeneratedColumn<String>('items_json', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
@override
List<GeneratedColumn> get $columns => [id, tenantId, clientId, paymentMethod, paymentStatus, subtotal, tax, totalAmount, paidAmount, date, itemsJson];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'sales';
@override
VerificationContext validateIntegrity(Insertable<Sale> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('client_id')) {
context.handle(_clientIdMeta, clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));}if (data.containsKey('payment_method')) {
context.handle(_paymentMethodMeta, paymentMethod.isAcceptableOrUnknown(data['payment_method']!, _paymentMethodMeta));} else if (isInserting) {
context.missing(_paymentMethodMeta);
}
if (data.containsKey('payment_status')) {
context.handle(_paymentStatusMeta, paymentStatus.isAcceptableOrUnknown(data['payment_status']!, _paymentStatusMeta));} else if (isInserting) {
context.missing(_paymentStatusMeta);
}
if (data.containsKey('subtotal')) {
context.handle(_subtotalMeta, subtotal.isAcceptableOrUnknown(data['subtotal']!, _subtotalMeta));} else if (isInserting) {
context.missing(_subtotalMeta);
}
if (data.containsKey('tax')) {
context.handle(_taxMeta, tax.isAcceptableOrUnknown(data['tax']!, _taxMeta));} else if (isInserting) {
context.missing(_taxMeta);
}
if (data.containsKey('total_amount')) {
context.handle(_totalAmountMeta, totalAmount.isAcceptableOrUnknown(data['total_amount']!, _totalAmountMeta));} else if (isInserting) {
context.missing(_totalAmountMeta);
}
if (data.containsKey('paid_amount')) {
context.handle(_paidAmountMeta, paidAmount.isAcceptableOrUnknown(data['paid_amount']!, _paidAmountMeta));}if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));} else if (isInserting) {
context.missing(_dateMeta);
}
if (data.containsKey('items_json')) {
context.handle(_itemsJsonMeta, itemsJson.isAcceptableOrUnknown(data['items_json']!, _itemsJsonMeta));} else if (isInserting) {
context.missing(_itemsJsonMeta);
}
return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Sale map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Sale(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, clientId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_id']), paymentMethod: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payment_method'])!, paymentStatus: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payment_status'])!, subtotal: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}subtotal'])!, tax: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}tax'])!, totalAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}total_amount'])!, paidAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}paid_amount'])!, date: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}date'])!, itemsJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}items_json'])!, );
}
@override
$SalesTable createAlias(String alias) {
return $SalesTable(attachedDatabase, alias);}}class Sale extends DataClass implements Insertable<Sale> 
{
final String id;
final String tenantId;
final String? clientId;
final String paymentMethod;
final String paymentStatus;
final double subtotal;
final double tax;
final double totalAmount;
final double paidAmount;
final DateTime date;
final String itemsJson;
const Sale({required this.id, required this.tenantId, this.clientId, required this.paymentMethod, required this.paymentStatus, required this.subtotal, required this.tax, required this.totalAmount, required this.paidAmount, required this.date, required this.itemsJson});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || clientId != null){map['client_id'] = Variable<String>(clientId);
}map['payment_method'] = Variable<String>(paymentMethod);
map['payment_status'] = Variable<String>(paymentStatus);
map['subtotal'] = Variable<double>(subtotal);
map['tax'] = Variable<double>(tax);
map['total_amount'] = Variable<double>(totalAmount);
map['paid_amount'] = Variable<double>(paidAmount);
map['date'] = Variable<DateTime>(date);
map['items_json'] = Variable<String>(itemsJson);
return map; 
}
SalesCompanion toCompanion(bool nullToAbsent) {
return SalesCompanion(id: Value(id),tenantId: Value(tenantId),clientId: clientId == null && nullToAbsent ? const Value.absent() : Value(clientId),paymentMethod: Value(paymentMethod),paymentStatus: Value(paymentStatus),subtotal: Value(subtotal),tax: Value(tax),totalAmount: Value(totalAmount),paidAmount: Value(paidAmount),date: Value(date),itemsJson: Value(itemsJson),);
}
factory Sale.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Sale(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),clientId: serializer.fromJson<String?>(json['clientId']),paymentMethod: serializer.fromJson<String>(json['paymentMethod']),paymentStatus: serializer.fromJson<String>(json['paymentStatus']),subtotal: serializer.fromJson<double>(json['subtotal']),tax: serializer.fromJson<double>(json['tax']),totalAmount: serializer.fromJson<double>(json['totalAmount']),paidAmount: serializer.fromJson<double>(json['paidAmount']),date: serializer.fromJson<DateTime>(json['date']),itemsJson: serializer.fromJson<String>(json['itemsJson']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'clientId': serializer.toJson<String?>(clientId),'paymentMethod': serializer.toJson<String>(paymentMethod),'paymentStatus': serializer.toJson<String>(paymentStatus),'subtotal': serializer.toJson<double>(subtotal),'tax': serializer.toJson<double>(tax),'totalAmount': serializer.toJson<double>(totalAmount),'paidAmount': serializer.toJson<double>(paidAmount),'date': serializer.toJson<DateTime>(date),'itemsJson': serializer.toJson<String>(itemsJson),};}Sale copyWith({String? id,String? tenantId,Value<String?> clientId = const Value.absent(),String? paymentMethod,String? paymentStatus,double? subtotal,double? tax,double? totalAmount,double? paidAmount,DateTime? date,String? itemsJson}) => Sale(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,clientId: clientId.present ? clientId.value : this.clientId,paymentMethod: paymentMethod ?? this.paymentMethod,paymentStatus: paymentStatus ?? this.paymentStatus,subtotal: subtotal ?? this.subtotal,tax: tax ?? this.tax,totalAmount: totalAmount ?? this.totalAmount,paidAmount: paidAmount ?? this.paidAmount,date: date ?? this.date,itemsJson: itemsJson ?? this.itemsJson,);Sale copyWithCompanion(SalesCompanion data) {
return Sale(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,clientId: data.clientId.present ? data.clientId.value : this.clientId,paymentMethod: data.paymentMethod.present ? data.paymentMethod.value : this.paymentMethod,paymentStatus: data.paymentStatus.present ? data.paymentStatus.value : this.paymentStatus,subtotal: data.subtotal.present ? data.subtotal.value : this.subtotal,tax: data.tax.present ? data.tax.value : this.tax,totalAmount: data.totalAmount.present ? data.totalAmount.value : this.totalAmount,paidAmount: data.paidAmount.present ? data.paidAmount.value : this.paidAmount,date: data.date.present ? data.date.value : this.date,itemsJson: data.itemsJson.present ? data.itemsJson.value : this.itemsJson,);
}
@override
String toString() {return (StringBuffer('Sale(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('clientId: $clientId, ')..write('paymentMethod: $paymentMethod, ')..write('paymentStatus: $paymentStatus, ')..write('subtotal: $subtotal, ')..write('tax: $tax, ')..write('totalAmount: $totalAmount, ')..write('paidAmount: $paidAmount, ')..write('date: $date, ')..write('itemsJson: $itemsJson')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, clientId, paymentMethod, paymentStatus, subtotal, tax, totalAmount, paidAmount, date, itemsJson);@override
bool operator ==(Object other) => identical(this, other) || (other is Sale && other.id == this.id && other.tenantId == this.tenantId && other.clientId == this.clientId && other.paymentMethod == this.paymentMethod && other.paymentStatus == this.paymentStatus && other.subtotal == this.subtotal && other.tax == this.tax && other.totalAmount == this.totalAmount && other.paidAmount == this.paidAmount && other.date == this.date && other.itemsJson == this.itemsJson);
}class SalesCompanion extends UpdateCompanion<Sale> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> clientId;
final Value<String> paymentMethod;
final Value<String> paymentStatus;
final Value<double> subtotal;
final Value<double> tax;
final Value<double> totalAmount;
final Value<double> paidAmount;
final Value<DateTime> date;
final Value<String> itemsJson;
final Value<int> rowid;
const SalesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.clientId = const Value.absent(),this.paymentMethod = const Value.absent(),this.paymentStatus = const Value.absent(),this.subtotal = const Value.absent(),this.tax = const Value.absent(),this.totalAmount = const Value.absent(),this.paidAmount = const Value.absent(),this.date = const Value.absent(),this.itemsJson = const Value.absent(),this.rowid = const Value.absent(),});
SalesCompanion.insert({required String id,required String tenantId,this.clientId = const Value.absent(),required String paymentMethod,required String paymentStatus,required double subtotal,required double tax,required double totalAmount,this.paidAmount = const Value.absent(),required DateTime date,required String itemsJson,this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), paymentMethod = Value(paymentMethod), paymentStatus = Value(paymentStatus), subtotal = Value(subtotal), tax = Value(tax), totalAmount = Value(totalAmount), date = Value(date), itemsJson = Value(itemsJson);
static Insertable<Sale> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? clientId, 
Expression<String>? paymentMethod, 
Expression<String>? paymentStatus, 
Expression<double>? subtotal, 
Expression<double>? tax, 
Expression<double>? totalAmount, 
Expression<double>? paidAmount, 
Expression<DateTime>? date, 
Expression<String>? itemsJson, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (clientId != null)'client_id': clientId,if (paymentMethod != null)'payment_method': paymentMethod,if (paymentStatus != null)'payment_status': paymentStatus,if (subtotal != null)'subtotal': subtotal,if (tax != null)'tax': tax,if (totalAmount != null)'total_amount': totalAmount,if (paidAmount != null)'paid_amount': paidAmount,if (date != null)'date': date,if (itemsJson != null)'items_json': itemsJson,if (rowid != null)'rowid': rowid,});
}SalesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? clientId, Value<String>? paymentMethod, Value<String>? paymentStatus, Value<double>? subtotal, Value<double>? tax, Value<double>? totalAmount, Value<double>? paidAmount, Value<DateTime>? date, Value<String>? itemsJson, Value<int>? rowid}) {
return SalesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,clientId: clientId ?? this.clientId,paymentMethod: paymentMethod ?? this.paymentMethod,paymentStatus: paymentStatus ?? this.paymentStatus,subtotal: subtotal ?? this.subtotal,tax: tax ?? this.tax,totalAmount: totalAmount ?? this.totalAmount,paidAmount: paidAmount ?? this.paidAmount,date: date ?? this.date,itemsJson: itemsJson ?? this.itemsJson,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (clientId.present) {
map['client_id'] = Variable<String>(clientId.value);}
if (paymentMethod.present) {
map['payment_method'] = Variable<String>(paymentMethod.value);}
if (paymentStatus.present) {
map['payment_status'] = Variable<String>(paymentStatus.value);}
if (subtotal.present) {
map['subtotal'] = Variable<double>(subtotal.value);}
if (tax.present) {
map['tax'] = Variable<double>(tax.value);}
if (totalAmount.present) {
map['total_amount'] = Variable<double>(totalAmount.value);}
if (paidAmount.present) {
map['paid_amount'] = Variable<double>(paidAmount.value);}
if (date.present) {
map['date'] = Variable<DateTime>(date.value);}
if (itemsJson.present) {
map['items_json'] = Variable<String>(itemsJson.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('SalesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('clientId: $clientId, ')..write('paymentMethod: $paymentMethod, ')..write('paymentStatus: $paymentStatus, ')..write('subtotal: $subtotal, ')..write('tax: $tax, ')..write('totalAmount: $totalAmount, ')..write('paidAmount: $paidAmount, ')..write('date: $date, ')..write('itemsJson: $itemsJson, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $ExpensesTable extends Expenses with TableInfo<$ExpensesTable, Expense>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$ExpensesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _categoryMeta = const VerificationMeta('category');
@override
late final GeneratedColumn<String> category = GeneratedColumn<String>('category', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _amountMeta = const VerificationMeta('amount');
@override
late final GeneratedColumn<double> amount = GeneratedColumn<double>('amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _noteMeta = const VerificationMeta('note');
@override
late final GeneratedColumn<String> note = GeneratedColumn<String>('note', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<DateTime> date = GeneratedColumn<DateTime>('date', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: true);
@override
List<GeneratedColumn> get $columns => [id, tenantId, category, amount, note, date];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'expenses';
@override
VerificationContext validateIntegrity(Insertable<Expense> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('category')) {
context.handle(_categoryMeta, category.isAcceptableOrUnknown(data['category']!, _categoryMeta));} else if (isInserting) {
context.missing(_categoryMeta);
}
if (data.containsKey('amount')) {
context.handle(_amountMeta, amount.isAcceptableOrUnknown(data['amount']!, _amountMeta));} else if (isInserting) {
context.missing(_amountMeta);
}
if (data.containsKey('note')) {
context.handle(_noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));}if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));} else if (isInserting) {
context.missing(_dateMeta);
}
return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Expense map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Expense(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, category: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}category'])!, amount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}amount'])!, note: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}note']), date: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}date'])!, );
}
@override
$ExpensesTable createAlias(String alias) {
return $ExpensesTable(attachedDatabase, alias);}}class Expense extends DataClass implements Insertable<Expense> 
{
final String id;
final String tenantId;
final String category;
final double amount;
final String? note;
final DateTime date;
const Expense({required this.id, required this.tenantId, required this.category, required this.amount, this.note, required this.date});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['category'] = Variable<String>(category);
map['amount'] = Variable<double>(amount);
if (!nullToAbsent || note != null){map['note'] = Variable<String>(note);
}map['date'] = Variable<DateTime>(date);
return map; 
}
ExpensesCompanion toCompanion(bool nullToAbsent) {
return ExpensesCompanion(id: Value(id),tenantId: Value(tenantId),category: Value(category),amount: Value(amount),note: note == null && nullToAbsent ? const Value.absent() : Value(note),date: Value(date),);
}
factory Expense.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Expense(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),category: serializer.fromJson<String>(json['category']),amount: serializer.fromJson<double>(json['amount']),note: serializer.fromJson<String?>(json['note']),date: serializer.fromJson<DateTime>(json['date']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'category': serializer.toJson<String>(category),'amount': serializer.toJson<double>(amount),'note': serializer.toJson<String?>(note),'date': serializer.toJson<DateTime>(date),};}Expense copyWith({String? id,String? tenantId,String? category,double? amount,Value<String?> note = const Value.absent(),DateTime? date}) => Expense(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,category: category ?? this.category,amount: amount ?? this.amount,note: note.present ? note.value : this.note,date: date ?? this.date,);Expense copyWithCompanion(ExpensesCompanion data) {
return Expense(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,category: data.category.present ? data.category.value : this.category,amount: data.amount.present ? data.amount.value : this.amount,note: data.note.present ? data.note.value : this.note,date: data.date.present ? data.date.value : this.date,);
}
@override
String toString() {return (StringBuffer('Expense(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('category: $category, ')..write('amount: $amount, ')..write('note: $note, ')..write('date: $date')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, category, amount, note, date);@override
bool operator ==(Object other) => identical(this, other) || (other is Expense && other.id == this.id && other.tenantId == this.tenantId && other.category == this.category && other.amount == this.amount && other.note == this.note && other.date == this.date);
}class ExpensesCompanion extends UpdateCompanion<Expense> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> category;
final Value<double> amount;
final Value<String?> note;
final Value<DateTime> date;
final Value<int> rowid;
const ExpensesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.category = const Value.absent(),this.amount = const Value.absent(),this.note = const Value.absent(),this.date = const Value.absent(),this.rowid = const Value.absent(),});
ExpensesCompanion.insert({required String id,required String tenantId,required String category,required double amount,this.note = const Value.absent(),required DateTime date,this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), category = Value(category), amount = Value(amount), date = Value(date);
static Insertable<Expense> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? category, 
Expression<double>? amount, 
Expression<String>? note, 
Expression<DateTime>? date, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (category != null)'category': category,if (amount != null)'amount': amount,if (note != null)'note': note,if (date != null)'date': date,if (rowid != null)'rowid': rowid,});
}ExpensesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? category, Value<double>? amount, Value<String?>? note, Value<DateTime>? date, Value<int>? rowid}) {
return ExpensesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,category: category ?? this.category,amount: amount ?? this.amount,note: note ?? this.note,date: date ?? this.date,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (category.present) {
map['category'] = Variable<String>(category.value);}
if (amount.present) {
map['amount'] = Variable<double>(amount.value);}
if (note.present) {
map['note'] = Variable<String>(note.value);}
if (date.present) {
map['date'] = Variable<DateTime>(date.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('ExpensesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('category: $category, ')..write('amount: $amount, ')..write('note: $note, ')..write('date: $date, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $SuppliersTable extends Suppliers with TableInfo<$SuppliersTable, Supplier>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$SuppliersTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _contactPersonMeta = const VerificationMeta('contactPerson');
@override
late final GeneratedColumn<String> contactPerson = GeneratedColumn<String>('contact_person', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _phoneMeta = const VerificationMeta('phone');
@override
late final GeneratedColumn<String> phone = GeneratedColumn<String>('phone', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _balanceMeta = const VerificationMeta('balance');
@override
late final GeneratedColumn<double> balance = GeneratedColumn<double>('balance', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, contactPerson, phone, balance];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'suppliers';
@override
VerificationContext validateIntegrity(Insertable<Supplier> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));} else if (isInserting) {
context.missing(_nameMeta);
}
if (data.containsKey('contact_person')) {
context.handle(_contactPersonMeta, contactPerson.isAcceptableOrUnknown(data['contact_person']!, _contactPersonMeta));}if (data.containsKey('phone')) {
context.handle(_phoneMeta, phone.isAcceptableOrUnknown(data['phone']!, _phoneMeta));}if (data.containsKey('balance')) {
context.handle(_balanceMeta, balance.isAcceptableOrUnknown(data['balance']!, _balanceMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Supplier map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Supplier(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!, contactPerson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}contact_person']), phone: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}phone']), balance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}balance'])!, );
}
@override
$SuppliersTable createAlias(String alias) {
return $SuppliersTable(attachedDatabase, alias);}}class Supplier extends DataClass implements Insertable<Supplier> 
{
final String id;
final String tenantId;
final String name;
final String? contactPerson;
final String? phone;
final double balance;
const Supplier({required this.id, required this.tenantId, required this.name, this.contactPerson, this.phone, required this.balance});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['name'] = Variable<String>(name);
if (!nullToAbsent || contactPerson != null){map['contact_person'] = Variable<String>(contactPerson);
}if (!nullToAbsent || phone != null){map['phone'] = Variable<String>(phone);
}map['balance'] = Variable<double>(balance);
return map; 
}
SuppliersCompanion toCompanion(bool nullToAbsent) {
return SuppliersCompanion(id: Value(id),tenantId: Value(tenantId),name: Value(name),contactPerson: contactPerson == null && nullToAbsent ? const Value.absent() : Value(contactPerson),phone: phone == null && nullToAbsent ? const Value.absent() : Value(phone),balance: Value(balance),);
}
factory Supplier.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Supplier(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String>(json['name']),contactPerson: serializer.fromJson<String?>(json['contactPerson']),phone: serializer.fromJson<String?>(json['phone']),balance: serializer.fromJson<double>(json['balance']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String>(name),'contactPerson': serializer.toJson<String?>(contactPerson),'phone': serializer.toJson<String?>(phone),'balance': serializer.toJson<double>(balance),};}Supplier copyWith({String? id,String? tenantId,String? name,Value<String?> contactPerson = const Value.absent(),Value<String?> phone = const Value.absent(),double? balance}) => Supplier(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,contactPerson: contactPerson.present ? contactPerson.value : this.contactPerson,phone: phone.present ? phone.value : this.phone,balance: balance ?? this.balance,);Supplier copyWithCompanion(SuppliersCompanion data) {
return Supplier(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,contactPerson: data.contactPerson.present ? data.contactPerson.value : this.contactPerson,phone: data.phone.present ? data.phone.value : this.phone,balance: data.balance.present ? data.balance.value : this.balance,);
}
@override
String toString() {return (StringBuffer('Supplier(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('contactPerson: $contactPerson, ')..write('phone: $phone, ')..write('balance: $balance')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, contactPerson, phone, balance);@override
bool operator ==(Object other) => identical(this, other) || (other is Supplier && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.contactPerson == this.contactPerson && other.phone == this.phone && other.balance == this.balance);
}class SuppliersCompanion extends UpdateCompanion<Supplier> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> name;
final Value<String?> contactPerson;
final Value<String?> phone;
final Value<double> balance;
final Value<int> rowid;
const SuppliersCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.contactPerson = const Value.absent(),this.phone = const Value.absent(),this.balance = const Value.absent(),this.rowid = const Value.absent(),});
SuppliersCompanion.insert({required String id,required String tenantId,required String name,this.contactPerson = const Value.absent(),this.phone = const Value.absent(),this.balance = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), name = Value(name);
static Insertable<Supplier> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? contactPerson, 
Expression<String>? phone, 
Expression<double>? balance, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (contactPerson != null)'contact_person': contactPerson,if (phone != null)'phone': phone,if (balance != null)'balance': balance,if (rowid != null)'rowid': rowid,});
}SuppliersCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? name, Value<String?>? contactPerson, Value<String?>? phone, Value<double>? balance, Value<int>? rowid}) {
return SuppliersCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,contactPerson: contactPerson ?? this.contactPerson,phone: phone ?? this.phone,balance: balance ?? this.balance,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (contactPerson.present) {
map['contact_person'] = Variable<String>(contactPerson.value);}
if (phone.present) {
map['phone'] = Variable<String>(phone.value);}
if (balance.present) {
map['balance'] = Variable<double>(balance.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('SuppliersCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('contactPerson: $contactPerson, ')..write('phone: $phone, ')..write('balance: $balance, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $PurchasesTable extends Purchases with TableInfo<$PurchasesTable, Purchase>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$PurchasesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _supplierIdMeta = const VerificationMeta('supplierId');
@override
late final GeneratedColumn<String> supplierId = GeneratedColumn<String>('supplier_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _productIdMeta = const VerificationMeta('productId');
@override
late final GeneratedColumn<String> productId = GeneratedColumn<String>('product_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _quantityMeta = const VerificationMeta('quantity');
@override
late final GeneratedColumn<double> quantity = GeneratedColumn<double>('quantity', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _totalAmountMeta = const VerificationMeta('totalAmount');
@override
late final GeneratedColumn<double> totalAmount = GeneratedColumn<double>('total_amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: true);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<DateTime> date = GeneratedColumn<DateTime>('date', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: true);
@override
List<GeneratedColumn> get $columns => [id, tenantId, supplierId, productId, quantity, totalAmount, date];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'purchases';
@override
VerificationContext validateIntegrity(Insertable<Purchase> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('supplier_id')) {
context.handle(_supplierIdMeta, supplierId.isAcceptableOrUnknown(data['supplier_id']!, _supplierIdMeta));}if (data.containsKey('product_id')) {
context.handle(_productIdMeta, productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta));}if (data.containsKey('quantity')) {
context.handle(_quantityMeta, quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta));} else if (isInserting) {
context.missing(_quantityMeta);
}
if (data.containsKey('total_amount')) {
context.handle(_totalAmountMeta, totalAmount.isAcceptableOrUnknown(data['total_amount']!, _totalAmountMeta));} else if (isInserting) {
context.missing(_totalAmountMeta);
}
if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));} else if (isInserting) {
context.missing(_dateMeta);
}
return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Purchase map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Purchase(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, supplierId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}supplier_id']), productId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}product_id']), quantity: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}quantity'])!, totalAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}total_amount'])!, date: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}date'])!, );
}
@override
$PurchasesTable createAlias(String alias) {
return $PurchasesTable(attachedDatabase, alias);}}class Purchase extends DataClass implements Insertable<Purchase> 
{
final String id;
final String tenantId;
final String? supplierId;
final String? productId;
final double quantity;
final double totalAmount;
final DateTime date;
const Purchase({required this.id, required this.tenantId, this.supplierId, this.productId, required this.quantity, required this.totalAmount, required this.date});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || supplierId != null){map['supplier_id'] = Variable<String>(supplierId);
}if (!nullToAbsent || productId != null){map['product_id'] = Variable<String>(productId);
}map['quantity'] = Variable<double>(quantity);
map['total_amount'] = Variable<double>(totalAmount);
map['date'] = Variable<DateTime>(date);
return map; 
}
PurchasesCompanion toCompanion(bool nullToAbsent) {
return PurchasesCompanion(id: Value(id),tenantId: Value(tenantId),supplierId: supplierId == null && nullToAbsent ? const Value.absent() : Value(supplierId),productId: productId == null && nullToAbsent ? const Value.absent() : Value(productId),quantity: Value(quantity),totalAmount: Value(totalAmount),date: Value(date),);
}
factory Purchase.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Purchase(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),supplierId: serializer.fromJson<String?>(json['supplierId']),productId: serializer.fromJson<String?>(json['productId']),quantity: serializer.fromJson<double>(json['quantity']),totalAmount: serializer.fromJson<double>(json['totalAmount']),date: serializer.fromJson<DateTime>(json['date']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'supplierId': serializer.toJson<String?>(supplierId),'productId': serializer.toJson<String?>(productId),'quantity': serializer.toJson<double>(quantity),'totalAmount': serializer.toJson<double>(totalAmount),'date': serializer.toJson<DateTime>(date),};}Purchase copyWith({String? id,String? tenantId,Value<String?> supplierId = const Value.absent(),Value<String?> productId = const Value.absent(),double? quantity,double? totalAmount,DateTime? date}) => Purchase(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,supplierId: supplierId.present ? supplierId.value : this.supplierId,productId: productId.present ? productId.value : this.productId,quantity: quantity ?? this.quantity,totalAmount: totalAmount ?? this.totalAmount,date: date ?? this.date,);Purchase copyWithCompanion(PurchasesCompanion data) {
return Purchase(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,supplierId: data.supplierId.present ? data.supplierId.value : this.supplierId,productId: data.productId.present ? data.productId.value : this.productId,quantity: data.quantity.present ? data.quantity.value : this.quantity,totalAmount: data.totalAmount.present ? data.totalAmount.value : this.totalAmount,date: data.date.present ? data.date.value : this.date,);
}
@override
String toString() {return (StringBuffer('Purchase(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('supplierId: $supplierId, ')..write('productId: $productId, ')..write('quantity: $quantity, ')..write('totalAmount: $totalAmount, ')..write('date: $date')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, supplierId, productId, quantity, totalAmount, date);@override
bool operator ==(Object other) => identical(this, other) || (other is Purchase && other.id == this.id && other.tenantId == this.tenantId && other.supplierId == this.supplierId && other.productId == this.productId && other.quantity == this.quantity && other.totalAmount == this.totalAmount && other.date == this.date);
}class PurchasesCompanion extends UpdateCompanion<Purchase> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> supplierId;
final Value<String?> productId;
final Value<double> quantity;
final Value<double> totalAmount;
final Value<DateTime> date;
final Value<int> rowid;
const PurchasesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.supplierId = const Value.absent(),this.productId = const Value.absent(),this.quantity = const Value.absent(),this.totalAmount = const Value.absent(),this.date = const Value.absent(),this.rowid = const Value.absent(),});
PurchasesCompanion.insert({required String id,required String tenantId,this.supplierId = const Value.absent(),this.productId = const Value.absent(),required double quantity,required double totalAmount,required DateTime date,this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), quantity = Value(quantity), totalAmount = Value(totalAmount), date = Value(date);
static Insertable<Purchase> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? supplierId, 
Expression<String>? productId, 
Expression<double>? quantity, 
Expression<double>? totalAmount, 
Expression<DateTime>? date, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (supplierId != null)'supplier_id': supplierId,if (productId != null)'product_id': productId,if (quantity != null)'quantity': quantity,if (totalAmount != null)'total_amount': totalAmount,if (date != null)'date': date,if (rowid != null)'rowid': rowid,});
}PurchasesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? supplierId, Value<String?>? productId, Value<double>? quantity, Value<double>? totalAmount, Value<DateTime>? date, Value<int>? rowid}) {
return PurchasesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,supplierId: supplierId ?? this.supplierId,productId: productId ?? this.productId,quantity: quantity ?? this.quantity,totalAmount: totalAmount ?? this.totalAmount,date: date ?? this.date,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (supplierId.present) {
map['supplier_id'] = Variable<String>(supplierId.value);}
if (productId.present) {
map['product_id'] = Variable<String>(productId.value);}
if (quantity.present) {
map['quantity'] = Variable<double>(quantity.value);}
if (totalAmount.present) {
map['total_amount'] = Variable<double>(totalAmount.value);}
if (date.present) {
map['date'] = Variable<DateTime>(date.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('PurchasesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('supplierId: $supplierId, ')..write('productId: $productId, ')..write('quantity: $quantity, ')..write('totalAmount: $totalAmount, ')..write('date: $date, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $InvoicesTable extends Invoices with TableInfo<$InvoicesTable, Invoice>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$InvoicesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _invoiceNumberMeta = const VerificationMeta('invoiceNumber');
@override
late final GeneratedColumn<String> invoiceNumber = GeneratedColumn<String>('invoice_number', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _clientIdMeta = const VerificationMeta('clientId');
@override
late final GeneratedColumn<String> clientId = GeneratedColumn<String>('client_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _clientNameMeta = const VerificationMeta('clientName');
@override
late final GeneratedColumn<String> clientName = GeneratedColumn<String>('client_name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _saleIdMeta = const VerificationMeta('saleId');
@override
late final GeneratedColumn<String> saleId = GeneratedColumn<String>('sale_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _invoiceDateMeta = const VerificationMeta('invoiceDate');
@override
late final GeneratedColumn<String> invoiceDate = GeneratedColumn<String>('invoice_date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _dueDateMeta = const VerificationMeta('dueDate');
@override
late final GeneratedColumn<String> dueDate = GeneratedColumn<String>('due_date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _taxableAmountMeta = const VerificationMeta('taxableAmount');
@override
late final GeneratedColumn<double> taxableAmount = GeneratedColumn<double>('taxable_amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _grandTotalMeta = const VerificationMeta('grandTotal');
@override
late final GeneratedColumn<double> grandTotal = GeneratedColumn<double>('grand_total', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _paidAmountMeta = const VerificationMeta('paidAmount');
@override
late final GeneratedColumn<double> paidAmount = GeneratedColumn<double>('paid_amount', aliasedName, false, type: DriftSqlType.double, requiredDuringInsert: false, defaultValue: const Constant(0));
static const VerificationMeta _paymentStatusMeta = const VerificationMeta('paymentStatus');
@override
late final GeneratedColumn<String> paymentStatus = GeneratedColumn<String>('payment_status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _irnMeta = const VerificationMeta('irn');
@override
late final GeneratedColumn<String> irn = GeneratedColumn<String>('irn', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _irnStatusMeta = const VerificationMeta('irnStatus');
@override
late final GeneratedColumn<String> irnStatus = GeneratedColumn<String>('irn_status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _ackNoMeta = const VerificationMeta('ackNo');
@override
late final GeneratedColumn<String> ackNo = GeneratedColumn<String>('ack_no', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _signedQrMeta = const VerificationMeta('signedQr');
@override
late final GeneratedColumn<String> signedQr = GeneratedColumn<String>('signed_qr', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _itemsJsonMeta = const VerificationMeta('itemsJson');
@override
late final GeneratedColumn<String> itemsJson = GeneratedColumn<String>('items_json', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, invoiceNumber, clientId, clientName, saleId, invoiceDate, dueDate, taxableAmount, grandTotal, paidAmount, paymentStatus, irn, irnStatus, ackNo, signedQr, itemsJson, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'invoices';
@override
VerificationContext validateIntegrity(Insertable<Invoice> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('invoice_number')) {
context.handle(_invoiceNumberMeta, invoiceNumber.isAcceptableOrUnknown(data['invoice_number']!, _invoiceNumberMeta));}if (data.containsKey('client_id')) {
context.handle(_clientIdMeta, clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));}if (data.containsKey('client_name')) {
context.handle(_clientNameMeta, clientName.isAcceptableOrUnknown(data['client_name']!, _clientNameMeta));}if (data.containsKey('sale_id')) {
context.handle(_saleIdMeta, saleId.isAcceptableOrUnknown(data['sale_id']!, _saleIdMeta));}if (data.containsKey('invoice_date')) {
context.handle(_invoiceDateMeta, invoiceDate.isAcceptableOrUnknown(data['invoice_date']!, _invoiceDateMeta));}if (data.containsKey('due_date')) {
context.handle(_dueDateMeta, dueDate.isAcceptableOrUnknown(data['due_date']!, _dueDateMeta));}if (data.containsKey('taxable_amount')) {
context.handle(_taxableAmountMeta, taxableAmount.isAcceptableOrUnknown(data['taxable_amount']!, _taxableAmountMeta));}if (data.containsKey('grand_total')) {
context.handle(_grandTotalMeta, grandTotal.isAcceptableOrUnknown(data['grand_total']!, _grandTotalMeta));}if (data.containsKey('paid_amount')) {
context.handle(_paidAmountMeta, paidAmount.isAcceptableOrUnknown(data['paid_amount']!, _paidAmountMeta));}if (data.containsKey('payment_status')) {
context.handle(_paymentStatusMeta, paymentStatus.isAcceptableOrUnknown(data['payment_status']!, _paymentStatusMeta));}if (data.containsKey('irn')) {
context.handle(_irnMeta, irn.isAcceptableOrUnknown(data['irn']!, _irnMeta));}if (data.containsKey('irn_status')) {
context.handle(_irnStatusMeta, irnStatus.isAcceptableOrUnknown(data['irn_status']!, _irnStatusMeta));}if (data.containsKey('ack_no')) {
context.handle(_ackNoMeta, ackNo.isAcceptableOrUnknown(data['ack_no']!, _ackNoMeta));}if (data.containsKey('signed_qr')) {
context.handle(_signedQrMeta, signedQr.isAcceptableOrUnknown(data['signed_qr']!, _signedQrMeta));}if (data.containsKey('items_json')) {
context.handle(_itemsJsonMeta, itemsJson.isAcceptableOrUnknown(data['items_json']!, _itemsJsonMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Invoice map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Invoice(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, invoiceNumber: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}invoice_number']), clientId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_id']), clientName: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_name']), saleId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}sale_id']), invoiceDate: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}invoice_date']), dueDate: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}due_date']), taxableAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}taxable_amount'])!, grandTotal: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}grand_total'])!, paidAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}paid_amount'])!, paymentStatus: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payment_status']), irn: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}irn']), irnStatus: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}irn_status']), ackNo: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}ack_no']), signedQr: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}signed_qr']), itemsJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}items_json']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$InvoicesTable createAlias(String alias) {
return $InvoicesTable(attachedDatabase, alias);}}class Invoice extends DataClass implements Insertable<Invoice> 
{
final String id;
final String tenantId;
final String? invoiceNumber;
final String? clientId;
final String? clientName;
final String? saleId;
final String? invoiceDate;
final String? dueDate;
final double taxableAmount;
final double grandTotal;
final double paidAmount;
final String? paymentStatus;
final String? irn;
final String? irnStatus;
final String? ackNo;
final String? signedQr;
final String? itemsJson;
final DateTime? updatedAt;
const Invoice({required this.id, required this.tenantId, this.invoiceNumber, this.clientId, this.clientName, this.saleId, this.invoiceDate, this.dueDate, required this.taxableAmount, required this.grandTotal, required this.paidAmount, this.paymentStatus, this.irn, this.irnStatus, this.ackNo, this.signedQr, this.itemsJson, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || invoiceNumber != null){map['invoice_number'] = Variable<String>(invoiceNumber);
}if (!nullToAbsent || clientId != null){map['client_id'] = Variable<String>(clientId);
}if (!nullToAbsent || clientName != null){map['client_name'] = Variable<String>(clientName);
}if (!nullToAbsent || saleId != null){map['sale_id'] = Variable<String>(saleId);
}if (!nullToAbsent || invoiceDate != null){map['invoice_date'] = Variable<String>(invoiceDate);
}if (!nullToAbsent || dueDate != null){map['due_date'] = Variable<String>(dueDate);
}map['taxable_amount'] = Variable<double>(taxableAmount);
map['grand_total'] = Variable<double>(grandTotal);
map['paid_amount'] = Variable<double>(paidAmount);
if (!nullToAbsent || paymentStatus != null){map['payment_status'] = Variable<String>(paymentStatus);
}if (!nullToAbsent || irn != null){map['irn'] = Variable<String>(irn);
}if (!nullToAbsent || irnStatus != null){map['irn_status'] = Variable<String>(irnStatus);
}if (!nullToAbsent || ackNo != null){map['ack_no'] = Variable<String>(ackNo);
}if (!nullToAbsent || signedQr != null){map['signed_qr'] = Variable<String>(signedQr);
}if (!nullToAbsent || itemsJson != null){map['items_json'] = Variable<String>(itemsJson);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
InvoicesCompanion toCompanion(bool nullToAbsent) {
return InvoicesCompanion(id: Value(id),tenantId: Value(tenantId),invoiceNumber: invoiceNumber == null && nullToAbsent ? const Value.absent() : Value(invoiceNumber),clientId: clientId == null && nullToAbsent ? const Value.absent() : Value(clientId),clientName: clientName == null && nullToAbsent ? const Value.absent() : Value(clientName),saleId: saleId == null && nullToAbsent ? const Value.absent() : Value(saleId),invoiceDate: invoiceDate == null && nullToAbsent ? const Value.absent() : Value(invoiceDate),dueDate: dueDate == null && nullToAbsent ? const Value.absent() : Value(dueDate),taxableAmount: Value(taxableAmount),grandTotal: Value(grandTotal),paidAmount: Value(paidAmount),paymentStatus: paymentStatus == null && nullToAbsent ? const Value.absent() : Value(paymentStatus),irn: irn == null && nullToAbsent ? const Value.absent() : Value(irn),irnStatus: irnStatus == null && nullToAbsent ? const Value.absent() : Value(irnStatus),ackNo: ackNo == null && nullToAbsent ? const Value.absent() : Value(ackNo),signedQr: signedQr == null && nullToAbsent ? const Value.absent() : Value(signedQr),itemsJson: itemsJson == null && nullToAbsent ? const Value.absent() : Value(itemsJson),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory Invoice.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Invoice(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),invoiceNumber: serializer.fromJson<String?>(json['invoiceNumber']),clientId: serializer.fromJson<String?>(json['clientId']),clientName: serializer.fromJson<String?>(json['clientName']),saleId: serializer.fromJson<String?>(json['saleId']),invoiceDate: serializer.fromJson<String?>(json['invoiceDate']),dueDate: serializer.fromJson<String?>(json['dueDate']),taxableAmount: serializer.fromJson<double>(json['taxableAmount']),grandTotal: serializer.fromJson<double>(json['grandTotal']),paidAmount: serializer.fromJson<double>(json['paidAmount']),paymentStatus: serializer.fromJson<String?>(json['paymentStatus']),irn: serializer.fromJson<String?>(json['irn']),irnStatus: serializer.fromJson<String?>(json['irnStatus']),ackNo: serializer.fromJson<String?>(json['ackNo']),signedQr: serializer.fromJson<String?>(json['signedQr']),itemsJson: serializer.fromJson<String?>(json['itemsJson']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'invoiceNumber': serializer.toJson<String?>(invoiceNumber),'clientId': serializer.toJson<String?>(clientId),'clientName': serializer.toJson<String?>(clientName),'saleId': serializer.toJson<String?>(saleId),'invoiceDate': serializer.toJson<String?>(invoiceDate),'dueDate': serializer.toJson<String?>(dueDate),'taxableAmount': serializer.toJson<double>(taxableAmount),'grandTotal': serializer.toJson<double>(grandTotal),'paidAmount': serializer.toJson<double>(paidAmount),'paymentStatus': serializer.toJson<String?>(paymentStatus),'irn': serializer.toJson<String?>(irn),'irnStatus': serializer.toJson<String?>(irnStatus),'ackNo': serializer.toJson<String?>(ackNo),'signedQr': serializer.toJson<String?>(signedQr),'itemsJson': serializer.toJson<String?>(itemsJson),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}Invoice copyWith({String? id,String? tenantId,Value<String?> invoiceNumber = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<String?> saleId = const Value.absent(),Value<String?> invoiceDate = const Value.absent(),Value<String?> dueDate = const Value.absent(),double? taxableAmount,double? grandTotal,double? paidAmount,Value<String?> paymentStatus = const Value.absent(),Value<String?> irn = const Value.absent(),Value<String?> irnStatus = const Value.absent(),Value<String?> ackNo = const Value.absent(),Value<String?> signedQr = const Value.absent(),Value<String?> itemsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => Invoice(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,invoiceNumber: invoiceNumber.present ? invoiceNumber.value : this.invoiceNumber,clientId: clientId.present ? clientId.value : this.clientId,clientName: clientName.present ? clientName.value : this.clientName,saleId: saleId.present ? saleId.value : this.saleId,invoiceDate: invoiceDate.present ? invoiceDate.value : this.invoiceDate,dueDate: dueDate.present ? dueDate.value : this.dueDate,taxableAmount: taxableAmount ?? this.taxableAmount,grandTotal: grandTotal ?? this.grandTotal,paidAmount: paidAmount ?? this.paidAmount,paymentStatus: paymentStatus.present ? paymentStatus.value : this.paymentStatus,irn: irn.present ? irn.value : this.irn,irnStatus: irnStatus.present ? irnStatus.value : this.irnStatus,ackNo: ackNo.present ? ackNo.value : this.ackNo,signedQr: signedQr.present ? signedQr.value : this.signedQr,itemsJson: itemsJson.present ? itemsJson.value : this.itemsJson,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);Invoice copyWithCompanion(InvoicesCompanion data) {
return Invoice(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,invoiceNumber: data.invoiceNumber.present ? data.invoiceNumber.value : this.invoiceNumber,clientId: data.clientId.present ? data.clientId.value : this.clientId,clientName: data.clientName.present ? data.clientName.value : this.clientName,saleId: data.saleId.present ? data.saleId.value : this.saleId,invoiceDate: data.invoiceDate.present ? data.invoiceDate.value : this.invoiceDate,dueDate: data.dueDate.present ? data.dueDate.value : this.dueDate,taxableAmount: data.taxableAmount.present ? data.taxableAmount.value : this.taxableAmount,grandTotal: data.grandTotal.present ? data.grandTotal.value : this.grandTotal,paidAmount: data.paidAmount.present ? data.paidAmount.value : this.paidAmount,paymentStatus: data.paymentStatus.present ? data.paymentStatus.value : this.paymentStatus,irn: data.irn.present ? data.irn.value : this.irn,irnStatus: data.irnStatus.present ? data.irnStatus.value : this.irnStatus,ackNo: data.ackNo.present ? data.ackNo.value : this.ackNo,signedQr: data.signedQr.present ? data.signedQr.value : this.signedQr,itemsJson: data.itemsJson.present ? data.itemsJson.value : this.itemsJson,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('Invoice(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('invoiceNumber: $invoiceNumber, ')..write('clientId: $clientId, ')..write('clientName: $clientName, ')..write('saleId: $saleId, ')..write('invoiceDate: $invoiceDate, ')..write('dueDate: $dueDate, ')..write('taxableAmount: $taxableAmount, ')..write('grandTotal: $grandTotal, ')..write('paidAmount: $paidAmount, ')..write('paymentStatus: $paymentStatus, ')..write('irn: $irn, ')..write('irnStatus: $irnStatus, ')..write('ackNo: $ackNo, ')..write('signedQr: $signedQr, ')..write('itemsJson: $itemsJson, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, invoiceNumber, clientId, clientName, saleId, invoiceDate, dueDate, taxableAmount, grandTotal, paidAmount, paymentStatus, irn, irnStatus, ackNo, signedQr, itemsJson, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Invoice && other.id == this.id && other.tenantId == this.tenantId && other.invoiceNumber == this.invoiceNumber && other.clientId == this.clientId && other.clientName == this.clientName && other.saleId == this.saleId && other.invoiceDate == this.invoiceDate && other.dueDate == this.dueDate && other.taxableAmount == this.taxableAmount && other.grandTotal == this.grandTotal && other.paidAmount == this.paidAmount && other.paymentStatus == this.paymentStatus && other.irn == this.irn && other.irnStatus == this.irnStatus && other.ackNo == this.ackNo && other.signedQr == this.signedQr && other.itemsJson == this.itemsJson && other.updatedAt == this.updatedAt);
}class InvoicesCompanion extends UpdateCompanion<Invoice> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> invoiceNumber;
final Value<String?> clientId;
final Value<String?> clientName;
final Value<String?> saleId;
final Value<String?> invoiceDate;
final Value<String?> dueDate;
final Value<double> taxableAmount;
final Value<double> grandTotal;
final Value<double> paidAmount;
final Value<String?> paymentStatus;
final Value<String?> irn;
final Value<String?> irnStatus;
final Value<String?> ackNo;
final Value<String?> signedQr;
final Value<String?> itemsJson;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const InvoicesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.invoiceNumber = const Value.absent(),this.clientId = const Value.absent(),this.clientName = const Value.absent(),this.saleId = const Value.absent(),this.invoiceDate = const Value.absent(),this.dueDate = const Value.absent(),this.taxableAmount = const Value.absent(),this.grandTotal = const Value.absent(),this.paidAmount = const Value.absent(),this.paymentStatus = const Value.absent(),this.irn = const Value.absent(),this.irnStatus = const Value.absent(),this.ackNo = const Value.absent(),this.signedQr = const Value.absent(),this.itemsJson = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
InvoicesCompanion.insert({required String id,required String tenantId,this.invoiceNumber = const Value.absent(),this.clientId = const Value.absent(),this.clientName = const Value.absent(),this.saleId = const Value.absent(),this.invoiceDate = const Value.absent(),this.dueDate = const Value.absent(),this.taxableAmount = const Value.absent(),this.grandTotal = const Value.absent(),this.paidAmount = const Value.absent(),this.paymentStatus = const Value.absent(),this.irn = const Value.absent(),this.irnStatus = const Value.absent(),this.ackNo = const Value.absent(),this.signedQr = const Value.absent(),this.itemsJson = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<Invoice> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? invoiceNumber, 
Expression<String>? clientId, 
Expression<String>? clientName, 
Expression<String>? saleId, 
Expression<String>? invoiceDate, 
Expression<String>? dueDate, 
Expression<double>? taxableAmount, 
Expression<double>? grandTotal, 
Expression<double>? paidAmount, 
Expression<String>? paymentStatus, 
Expression<String>? irn, 
Expression<String>? irnStatus, 
Expression<String>? ackNo, 
Expression<String>? signedQr, 
Expression<String>? itemsJson, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (invoiceNumber != null)'invoice_number': invoiceNumber,if (clientId != null)'client_id': clientId,if (clientName != null)'client_name': clientName,if (saleId != null)'sale_id': saleId,if (invoiceDate != null)'invoice_date': invoiceDate,if (dueDate != null)'due_date': dueDate,if (taxableAmount != null)'taxable_amount': taxableAmount,if (grandTotal != null)'grand_total': grandTotal,if (paidAmount != null)'paid_amount': paidAmount,if (paymentStatus != null)'payment_status': paymentStatus,if (irn != null)'irn': irn,if (irnStatus != null)'irn_status': irnStatus,if (ackNo != null)'ack_no': ackNo,if (signedQr != null)'signed_qr': signedQr,if (itemsJson != null)'items_json': itemsJson,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}InvoicesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? invoiceNumber, Value<String?>? clientId, Value<String?>? clientName, Value<String?>? saleId, Value<String?>? invoiceDate, Value<String?>? dueDate, Value<double>? taxableAmount, Value<double>? grandTotal, Value<double>? paidAmount, Value<String?>? paymentStatus, Value<String?>? irn, Value<String?>? irnStatus, Value<String?>? ackNo, Value<String?>? signedQr, Value<String?>? itemsJson, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return InvoicesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,invoiceNumber: invoiceNumber ?? this.invoiceNumber,clientId: clientId ?? this.clientId,clientName: clientName ?? this.clientName,saleId: saleId ?? this.saleId,invoiceDate: invoiceDate ?? this.invoiceDate,dueDate: dueDate ?? this.dueDate,taxableAmount: taxableAmount ?? this.taxableAmount,grandTotal: grandTotal ?? this.grandTotal,paidAmount: paidAmount ?? this.paidAmount,paymentStatus: paymentStatus ?? this.paymentStatus,irn: irn ?? this.irn,irnStatus: irnStatus ?? this.irnStatus,ackNo: ackNo ?? this.ackNo,signedQr: signedQr ?? this.signedQr,itemsJson: itemsJson ?? this.itemsJson,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (invoiceNumber.present) {
map['invoice_number'] = Variable<String>(invoiceNumber.value);}
if (clientId.present) {
map['client_id'] = Variable<String>(clientId.value);}
if (clientName.present) {
map['client_name'] = Variable<String>(clientName.value);}
if (saleId.present) {
map['sale_id'] = Variable<String>(saleId.value);}
if (invoiceDate.present) {
map['invoice_date'] = Variable<String>(invoiceDate.value);}
if (dueDate.present) {
map['due_date'] = Variable<String>(dueDate.value);}
if (taxableAmount.present) {
map['taxable_amount'] = Variable<double>(taxableAmount.value);}
if (grandTotal.present) {
map['grand_total'] = Variable<double>(grandTotal.value);}
if (paidAmount.present) {
map['paid_amount'] = Variable<double>(paidAmount.value);}
if (paymentStatus.present) {
map['payment_status'] = Variable<String>(paymentStatus.value);}
if (irn.present) {
map['irn'] = Variable<String>(irn.value);}
if (irnStatus.present) {
map['irn_status'] = Variable<String>(irnStatus.value);}
if (ackNo.present) {
map['ack_no'] = Variable<String>(ackNo.value);}
if (signedQr.present) {
map['signed_qr'] = Variable<String>(signedQr.value);}
if (itemsJson.present) {
map['items_json'] = Variable<String>(itemsJson.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('InvoicesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('invoiceNumber: $invoiceNumber, ')..write('clientId: $clientId, ')..write('clientName: $clientName, ')..write('saleId: $saleId, ')..write('invoiceDate: $invoiceDate, ')..write('dueDate: $dueDate, ')..write('taxableAmount: $taxableAmount, ')..write('grandTotal: $grandTotal, ')..write('paidAmount: $paidAmount, ')..write('paymentStatus: $paymentStatus, ')..write('irn: $irn, ')..write('irnStatus: $irnStatus, ')..write('ackNo: $ackNo, ')..write('signedQr: $signedQr, ')..write('itemsJson: $itemsJson, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $BusinessProfileLocalTable extends BusinessProfileLocal with TableInfo<$BusinessProfileLocalTable, BusinessProfileLocalData>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$BusinessProfileLocalTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _addressMeta = const VerificationMeta('address');
@override
late final GeneratedColumn<String> address = GeneratedColumn<String>('address', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _phoneMeta = const VerificationMeta('phone');
@override
late final GeneratedColumn<String> phone = GeneratedColumn<String>('phone', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _emailMeta = const VerificationMeta('email');
@override
late final GeneratedColumn<String> email = GeneratedColumn<String>('email', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _currencyMeta = const VerificationMeta('currency');
@override
late final GeneratedColumn<String> currency = GeneratedColumn<String>('currency', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _gstNoMeta = const VerificationMeta('gstNo');
@override
late final GeneratedColumn<String> gstNo = GeneratedColumn<String>('gst_no', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _panNoMeta = const VerificationMeta('panNo');
@override
late final GeneratedColumn<String> panNo = GeneratedColumn<String>('pan_no', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _upiIdMeta = const VerificationMeta('upiId');
@override
late final GeneratedColumn<String> upiId = GeneratedColumn<String>('upi_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _invoiceTermsMeta = const VerificationMeta('invoiceTerms');
@override
late final GeneratedColumn<String> invoiceTerms = GeneratedColumn<String>('invoice_terms', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _footerMessageMeta = const VerificationMeta('footerMessage');
@override
late final GeneratedColumn<String> footerMessage = GeneratedColumn<String>('footer_message', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _autoIrnEnabledMeta = const VerificationMeta('autoIrnEnabled');
@override
late final GeneratedColumn<bool> autoIrnEnabled = GeneratedColumn<bool>('auto_irn_enabled', aliasedName, false, type: DriftSqlType.bool, requiredDuringInsert: false, defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("auto_irn_enabled" IN (0, 1))'), defaultValue: const Constant(false));
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [tenantId, name, address, phone, email, currency, gstNo, panNo, upiId, invoiceTerms, footerMessage, autoIrnEnabled, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'business_profile_local';
@override
VerificationContext validateIntegrity(Insertable<BusinessProfileLocalData> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));}if (data.containsKey('address')) {
context.handle(_addressMeta, address.isAcceptableOrUnknown(data['address']!, _addressMeta));}if (data.containsKey('phone')) {
context.handle(_phoneMeta, phone.isAcceptableOrUnknown(data['phone']!, _phoneMeta));}if (data.containsKey('email')) {
context.handle(_emailMeta, email.isAcceptableOrUnknown(data['email']!, _emailMeta));}if (data.containsKey('currency')) {
context.handle(_currencyMeta, currency.isAcceptableOrUnknown(data['currency']!, _currencyMeta));}if (data.containsKey('gst_no')) {
context.handle(_gstNoMeta, gstNo.isAcceptableOrUnknown(data['gst_no']!, _gstNoMeta));}if (data.containsKey('pan_no')) {
context.handle(_panNoMeta, panNo.isAcceptableOrUnknown(data['pan_no']!, _panNoMeta));}if (data.containsKey('upi_id')) {
context.handle(_upiIdMeta, upiId.isAcceptableOrUnknown(data['upi_id']!, _upiIdMeta));}if (data.containsKey('invoice_terms')) {
context.handle(_invoiceTermsMeta, invoiceTerms.isAcceptableOrUnknown(data['invoice_terms']!, _invoiceTermsMeta));}if (data.containsKey('footer_message')) {
context.handle(_footerMessageMeta, footerMessage.isAcceptableOrUnknown(data['footer_message']!, _footerMessageMeta));}if (data.containsKey('auto_irn_enabled')) {
context.handle(_autoIrnEnabledMeta, autoIrnEnabled.isAcceptableOrUnknown(data['auto_irn_enabled']!, _autoIrnEnabledMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {tenantId};
@override BusinessProfileLocalData map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return BusinessProfileLocalData(tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name']), address: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}address']), phone: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}phone']), email: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}email']), currency: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}currency']), gstNo: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}gst_no']), panNo: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}pan_no']), upiId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}upi_id']), invoiceTerms: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}invoice_terms']), footerMessage: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}footer_message']), autoIrnEnabled: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}auto_irn_enabled'])!, updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$BusinessProfileLocalTable createAlias(String alias) {
return $BusinessProfileLocalTable(attachedDatabase, alias);}}class BusinessProfileLocalData extends DataClass implements Insertable<BusinessProfileLocalData> 
{
final String tenantId;
final String? name;
final String? address;
final String? phone;
final String? email;
final String? currency;
final String? gstNo;
final String? panNo;
final String? upiId;
final String? invoiceTerms;
final String? footerMessage;
final bool autoIrnEnabled;
final DateTime? updatedAt;
const BusinessProfileLocalData({required this.tenantId, this.name, this.address, this.phone, this.email, this.currency, this.gstNo, this.panNo, this.upiId, this.invoiceTerms, this.footerMessage, required this.autoIrnEnabled, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || name != null){map['name'] = Variable<String>(name);
}if (!nullToAbsent || address != null){map['address'] = Variable<String>(address);
}if (!nullToAbsent || phone != null){map['phone'] = Variable<String>(phone);
}if (!nullToAbsent || email != null){map['email'] = Variable<String>(email);
}if (!nullToAbsent || currency != null){map['currency'] = Variable<String>(currency);
}if (!nullToAbsent || gstNo != null){map['gst_no'] = Variable<String>(gstNo);
}if (!nullToAbsent || panNo != null){map['pan_no'] = Variable<String>(panNo);
}if (!nullToAbsent || upiId != null){map['upi_id'] = Variable<String>(upiId);
}if (!nullToAbsent || invoiceTerms != null){map['invoice_terms'] = Variable<String>(invoiceTerms);
}if (!nullToAbsent || footerMessage != null){map['footer_message'] = Variable<String>(footerMessage);
}map['auto_irn_enabled'] = Variable<bool>(autoIrnEnabled);
if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
BusinessProfileLocalCompanion toCompanion(bool nullToAbsent) {
return BusinessProfileLocalCompanion(tenantId: Value(tenantId),name: name == null && nullToAbsent ? const Value.absent() : Value(name),address: address == null && nullToAbsent ? const Value.absent() : Value(address),phone: phone == null && nullToAbsent ? const Value.absent() : Value(phone),email: email == null && nullToAbsent ? const Value.absent() : Value(email),currency: currency == null && nullToAbsent ? const Value.absent() : Value(currency),gstNo: gstNo == null && nullToAbsent ? const Value.absent() : Value(gstNo),panNo: panNo == null && nullToAbsent ? const Value.absent() : Value(panNo),upiId: upiId == null && nullToAbsent ? const Value.absent() : Value(upiId),invoiceTerms: invoiceTerms == null && nullToAbsent ? const Value.absent() : Value(invoiceTerms),footerMessage: footerMessage == null && nullToAbsent ? const Value.absent() : Value(footerMessage),autoIrnEnabled: Value(autoIrnEnabled),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory BusinessProfileLocalData.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return BusinessProfileLocalData(tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String?>(json['name']),address: serializer.fromJson<String?>(json['address']),phone: serializer.fromJson<String?>(json['phone']),email: serializer.fromJson<String?>(json['email']),currency: serializer.fromJson<String?>(json['currency']),gstNo: serializer.fromJson<String?>(json['gstNo']),panNo: serializer.fromJson<String?>(json['panNo']),upiId: serializer.fromJson<String?>(json['upiId']),invoiceTerms: serializer.fromJson<String?>(json['invoiceTerms']),footerMessage: serializer.fromJson<String?>(json['footerMessage']),autoIrnEnabled: serializer.fromJson<bool>(json['autoIrnEnabled']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String?>(name),'address': serializer.toJson<String?>(address),'phone': serializer.toJson<String?>(phone),'email': serializer.toJson<String?>(email),'currency': serializer.toJson<String?>(currency),'gstNo': serializer.toJson<String?>(gstNo),'panNo': serializer.toJson<String?>(panNo),'upiId': serializer.toJson<String?>(upiId),'invoiceTerms': serializer.toJson<String?>(invoiceTerms),'footerMessage': serializer.toJson<String?>(footerMessage),'autoIrnEnabled': serializer.toJson<bool>(autoIrnEnabled),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}BusinessProfileLocalData copyWith({String? tenantId,Value<String?> name = const Value.absent(),Value<String?> address = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> currency = const Value.absent(),Value<String?> gstNo = const Value.absent(),Value<String?> panNo = const Value.absent(),Value<String?> upiId = const Value.absent(),Value<String?> invoiceTerms = const Value.absent(),Value<String?> footerMessage = const Value.absent(),bool? autoIrnEnabled,Value<DateTime?> updatedAt = const Value.absent()}) => BusinessProfileLocalData(tenantId: tenantId ?? this.tenantId,name: name.present ? name.value : this.name,address: address.present ? address.value : this.address,phone: phone.present ? phone.value : this.phone,email: email.present ? email.value : this.email,currency: currency.present ? currency.value : this.currency,gstNo: gstNo.present ? gstNo.value : this.gstNo,panNo: panNo.present ? panNo.value : this.panNo,upiId: upiId.present ? upiId.value : this.upiId,invoiceTerms: invoiceTerms.present ? invoiceTerms.value : this.invoiceTerms,footerMessage: footerMessage.present ? footerMessage.value : this.footerMessage,autoIrnEnabled: autoIrnEnabled ?? this.autoIrnEnabled,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);BusinessProfileLocalData copyWithCompanion(BusinessProfileLocalCompanion data) {
return BusinessProfileLocalData(
tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,address: data.address.present ? data.address.value : this.address,phone: data.phone.present ? data.phone.value : this.phone,email: data.email.present ? data.email.value : this.email,currency: data.currency.present ? data.currency.value : this.currency,gstNo: data.gstNo.present ? data.gstNo.value : this.gstNo,panNo: data.panNo.present ? data.panNo.value : this.panNo,upiId: data.upiId.present ? data.upiId.value : this.upiId,invoiceTerms: data.invoiceTerms.present ? data.invoiceTerms.value : this.invoiceTerms,footerMessage: data.footerMessage.present ? data.footerMessage.value : this.footerMessage,autoIrnEnabled: data.autoIrnEnabled.present ? data.autoIrnEnabled.value : this.autoIrnEnabled,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('BusinessProfileLocalData(')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('address: $address, ')..write('phone: $phone, ')..write('email: $email, ')..write('currency: $currency, ')..write('gstNo: $gstNo, ')..write('panNo: $panNo, ')..write('upiId: $upiId, ')..write('invoiceTerms: $invoiceTerms, ')..write('footerMessage: $footerMessage, ')..write('autoIrnEnabled: $autoIrnEnabled, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(tenantId, name, address, phone, email, currency, gstNo, panNo, upiId, invoiceTerms, footerMessage, autoIrnEnabled, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is BusinessProfileLocalData && other.tenantId == this.tenantId && other.name == this.name && other.address == this.address && other.phone == this.phone && other.email == this.email && other.currency == this.currency && other.gstNo == this.gstNo && other.panNo == this.panNo && other.upiId == this.upiId && other.invoiceTerms == this.invoiceTerms && other.footerMessage == this.footerMessage && other.autoIrnEnabled == this.autoIrnEnabled && other.updatedAt == this.updatedAt);
}class BusinessProfileLocalCompanion extends UpdateCompanion<BusinessProfileLocalData> {
final Value<String> tenantId;
final Value<String?> name;
final Value<String?> address;
final Value<String?> phone;
final Value<String?> email;
final Value<String?> currency;
final Value<String?> gstNo;
final Value<String?> panNo;
final Value<String?> upiId;
final Value<String?> invoiceTerms;
final Value<String?> footerMessage;
final Value<bool> autoIrnEnabled;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const BusinessProfileLocalCompanion({this.tenantId = const Value.absent(),this.name = const Value.absent(),this.address = const Value.absent(),this.phone = const Value.absent(),this.email = const Value.absent(),this.currency = const Value.absent(),this.gstNo = const Value.absent(),this.panNo = const Value.absent(),this.upiId = const Value.absent(),this.invoiceTerms = const Value.absent(),this.footerMessage = const Value.absent(),this.autoIrnEnabled = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
BusinessProfileLocalCompanion.insert({required String tenantId,this.name = const Value.absent(),this.address = const Value.absent(),this.phone = const Value.absent(),this.email = const Value.absent(),this.currency = const Value.absent(),this.gstNo = const Value.absent(),this.panNo = const Value.absent(),this.upiId = const Value.absent(),this.invoiceTerms = const Value.absent(),this.footerMessage = const Value.absent(),this.autoIrnEnabled = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): tenantId = Value(tenantId);
static Insertable<BusinessProfileLocalData> custom({Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? address, 
Expression<String>? phone, 
Expression<String>? email, 
Expression<String>? currency, 
Expression<String>? gstNo, 
Expression<String>? panNo, 
Expression<String>? upiId, 
Expression<String>? invoiceTerms, 
Expression<String>? footerMessage, 
Expression<bool>? autoIrnEnabled, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (address != null)'address': address,if (phone != null)'phone': phone,if (email != null)'email': email,if (currency != null)'currency': currency,if (gstNo != null)'gst_no': gstNo,if (panNo != null)'pan_no': panNo,if (upiId != null)'upi_id': upiId,if (invoiceTerms != null)'invoice_terms': invoiceTerms,if (footerMessage != null)'footer_message': footerMessage,if (autoIrnEnabled != null)'auto_irn_enabled': autoIrnEnabled,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}BusinessProfileLocalCompanion copyWith({Value<String>? tenantId, Value<String?>? name, Value<String?>? address, Value<String?>? phone, Value<String?>? email, Value<String?>? currency, Value<String?>? gstNo, Value<String?>? panNo, Value<String?>? upiId, Value<String?>? invoiceTerms, Value<String?>? footerMessage, Value<bool>? autoIrnEnabled, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return BusinessProfileLocalCompanion(tenantId: tenantId ?? this.tenantId,name: name ?? this.name,address: address ?? this.address,phone: phone ?? this.phone,email: email ?? this.email,currency: currency ?? this.currency,gstNo: gstNo ?? this.gstNo,panNo: panNo ?? this.panNo,upiId: upiId ?? this.upiId,invoiceTerms: invoiceTerms ?? this.invoiceTerms,footerMessage: footerMessage ?? this.footerMessage,autoIrnEnabled: autoIrnEnabled ?? this.autoIrnEnabled,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (address.present) {
map['address'] = Variable<String>(address.value);}
if (phone.present) {
map['phone'] = Variable<String>(phone.value);}
if (email.present) {
map['email'] = Variable<String>(email.value);}
if (currency.present) {
map['currency'] = Variable<String>(currency.value);}
if (gstNo.present) {
map['gst_no'] = Variable<String>(gstNo.value);}
if (panNo.present) {
map['pan_no'] = Variable<String>(panNo.value);}
if (upiId.present) {
map['upi_id'] = Variable<String>(upiId.value);}
if (invoiceTerms.present) {
map['invoice_terms'] = Variable<String>(invoiceTerms.value);}
if (footerMessage.present) {
map['footer_message'] = Variable<String>(footerMessage.value);}
if (autoIrnEnabled.present) {
map['auto_irn_enabled'] = Variable<bool>(autoIrnEnabled.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('BusinessProfileLocalCompanion(')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('address: $address, ')..write('phone: $phone, ')..write('email: $email, ')..write('currency: $currency, ')..write('gstNo: $gstNo, ')..write('panNo: $panNo, ')..write('upiId: $upiId, ')..write('invoiceTerms: $invoiceTerms, ')..write('footerMessage: $footerMessage, ')..write('autoIrnEnabled: $autoIrnEnabled, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $RoutesTable extends Routes with TableInfo<$RoutesTable, Route>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$RoutesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _vehicleIdMeta = const VerificationMeta('vehicleId');
@override
late final GeneratedColumn<String> vehicleId = GeneratedColumn<String>('vehicle_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _driverIdMeta = const VerificationMeta('driverId');
@override
late final GeneratedColumn<String> driverId = GeneratedColumn<String>('driver_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _locationMeta = const VerificationMeta('location');
@override
late final GeneratedColumn<String> location = GeneratedColumn<String>('location', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _initialOdometerMeta = const VerificationMeta('initialOdometer');
@override
late final GeneratedColumn<double> initialOdometer = GeneratedColumn<double>('initial_odometer', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _finalOdometerMeta = const VerificationMeta('finalOdometer');
@override
late final GeneratedColumn<double> finalOdometer = GeneratedColumn<double>('final_odometer', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _actualCashMeta = const VerificationMeta('actualCash');
@override
late final GeneratedColumn<double> actualCash = GeneratedColumn<double>('actual_cash', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _assignedOrdersJsonMeta = const VerificationMeta('assignedOrdersJson');
@override
late final GeneratedColumn<String> assignedOrdersJson = GeneratedColumn<String>('assigned_orders_json', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<DateTime> date = GeneratedColumn<DateTime>('date', aliasedName, false, type: DriftSqlType.dateTime, requiredDuringInsert: true);
@override
List<GeneratedColumn> get $columns => [id, tenantId, vehicleId, driverId, status, location, initialOdometer, finalOdometer, actualCash, assignedOrdersJson, date];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'routes';
@override
VerificationContext validateIntegrity(Insertable<Route> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('vehicle_id')) {
context.handle(_vehicleIdMeta, vehicleId.isAcceptableOrUnknown(data['vehicle_id']!, _vehicleIdMeta));}if (data.containsKey('driver_id')) {
context.handle(_driverIdMeta, driverId.isAcceptableOrUnknown(data['driver_id']!, _driverIdMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));} else if (isInserting) {
context.missing(_statusMeta);
}
if (data.containsKey('location')) {
context.handle(_locationMeta, location.isAcceptableOrUnknown(data['location']!, _locationMeta));}if (data.containsKey('initial_odometer')) {
context.handle(_initialOdometerMeta, initialOdometer.isAcceptableOrUnknown(data['initial_odometer']!, _initialOdometerMeta));}if (data.containsKey('final_odometer')) {
context.handle(_finalOdometerMeta, finalOdometer.isAcceptableOrUnknown(data['final_odometer']!, _finalOdometerMeta));}if (data.containsKey('actual_cash')) {
context.handle(_actualCashMeta, actualCash.isAcceptableOrUnknown(data['actual_cash']!, _actualCashMeta));}if (data.containsKey('assigned_orders_json')) {
context.handle(_assignedOrdersJsonMeta, assignedOrdersJson.isAcceptableOrUnknown(data['assigned_orders_json']!, _assignedOrdersJsonMeta));}if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));} else if (isInserting) {
context.missing(_dateMeta);
}
return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Route map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Route(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, vehicleId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}vehicle_id']), driverId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}driver_id']), status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!, location: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}location']), initialOdometer: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}initial_odometer']), finalOdometer: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}final_odometer']), actualCash: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}actual_cash']), assignedOrdersJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}assigned_orders_json']), date: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}date'])!, );
}
@override
$RoutesTable createAlias(String alias) {
return $RoutesTable(attachedDatabase, alias);}}class Route extends DataClass implements Insertable<Route> 
{
final String id;
final String tenantId;
final String? vehicleId;
final String? driverId;
final String status;
final String? location;
final double? initialOdometer;
final double? finalOdometer;
final double? actualCash;
final String? assignedOrdersJson;
final DateTime date;
const Route({required this.id, required this.tenantId, this.vehicleId, this.driverId, required this.status, this.location, this.initialOdometer, this.finalOdometer, this.actualCash, this.assignedOrdersJson, required this.date});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || vehicleId != null){map['vehicle_id'] = Variable<String>(vehicleId);
}if (!nullToAbsent || driverId != null){map['driver_id'] = Variable<String>(driverId);
}map['status'] = Variable<String>(status);
if (!nullToAbsent || location != null){map['location'] = Variable<String>(location);
}if (!nullToAbsent || initialOdometer != null){map['initial_odometer'] = Variable<double>(initialOdometer);
}if (!nullToAbsent || finalOdometer != null){map['final_odometer'] = Variable<double>(finalOdometer);
}if (!nullToAbsent || actualCash != null){map['actual_cash'] = Variable<double>(actualCash);
}if (!nullToAbsent || assignedOrdersJson != null){map['assigned_orders_json'] = Variable<String>(assignedOrdersJson);
}map['date'] = Variable<DateTime>(date);
return map; 
}
RoutesCompanion toCompanion(bool nullToAbsent) {
return RoutesCompanion(id: Value(id),tenantId: Value(tenantId),vehicleId: vehicleId == null && nullToAbsent ? const Value.absent() : Value(vehicleId),driverId: driverId == null && nullToAbsent ? const Value.absent() : Value(driverId),status: Value(status),location: location == null && nullToAbsent ? const Value.absent() : Value(location),initialOdometer: initialOdometer == null && nullToAbsent ? const Value.absent() : Value(initialOdometer),finalOdometer: finalOdometer == null && nullToAbsent ? const Value.absent() : Value(finalOdometer),actualCash: actualCash == null && nullToAbsent ? const Value.absent() : Value(actualCash),assignedOrdersJson: assignedOrdersJson == null && nullToAbsent ? const Value.absent() : Value(assignedOrdersJson),date: Value(date),);
}
factory Route.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Route(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),vehicleId: serializer.fromJson<String?>(json['vehicleId']),driverId: serializer.fromJson<String?>(json['driverId']),status: serializer.fromJson<String>(json['status']),location: serializer.fromJson<String?>(json['location']),initialOdometer: serializer.fromJson<double?>(json['initialOdometer']),finalOdometer: serializer.fromJson<double?>(json['finalOdometer']),actualCash: serializer.fromJson<double?>(json['actualCash']),assignedOrdersJson: serializer.fromJson<String?>(json['assignedOrdersJson']),date: serializer.fromJson<DateTime>(json['date']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'vehicleId': serializer.toJson<String?>(vehicleId),'driverId': serializer.toJson<String?>(driverId),'status': serializer.toJson<String>(status),'location': serializer.toJson<String?>(location),'initialOdometer': serializer.toJson<double?>(initialOdometer),'finalOdometer': serializer.toJson<double?>(finalOdometer),'actualCash': serializer.toJson<double?>(actualCash),'assignedOrdersJson': serializer.toJson<String?>(assignedOrdersJson),'date': serializer.toJson<DateTime>(date),};}Route copyWith({String? id,String? tenantId,Value<String?> vehicleId = const Value.absent(),Value<String?> driverId = const Value.absent(),String? status,Value<String?> location = const Value.absent(),Value<double?> initialOdometer = const Value.absent(),Value<double?> finalOdometer = const Value.absent(),Value<double?> actualCash = const Value.absent(),Value<String?> assignedOrdersJson = const Value.absent(),DateTime? date}) => Route(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,vehicleId: vehicleId.present ? vehicleId.value : this.vehicleId,driverId: driverId.present ? driverId.value : this.driverId,status: status ?? this.status,location: location.present ? location.value : this.location,initialOdometer: initialOdometer.present ? initialOdometer.value : this.initialOdometer,finalOdometer: finalOdometer.present ? finalOdometer.value : this.finalOdometer,actualCash: actualCash.present ? actualCash.value : this.actualCash,assignedOrdersJson: assignedOrdersJson.present ? assignedOrdersJson.value : this.assignedOrdersJson,date: date ?? this.date,);Route copyWithCompanion(RoutesCompanion data) {
return Route(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,vehicleId: data.vehicleId.present ? data.vehicleId.value : this.vehicleId,driverId: data.driverId.present ? data.driverId.value : this.driverId,status: data.status.present ? data.status.value : this.status,location: data.location.present ? data.location.value : this.location,initialOdometer: data.initialOdometer.present ? data.initialOdometer.value : this.initialOdometer,finalOdometer: data.finalOdometer.present ? data.finalOdometer.value : this.finalOdometer,actualCash: data.actualCash.present ? data.actualCash.value : this.actualCash,assignedOrdersJson: data.assignedOrdersJson.present ? data.assignedOrdersJson.value : this.assignedOrdersJson,date: data.date.present ? data.date.value : this.date,);
}
@override
String toString() {return (StringBuffer('Route(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('vehicleId: $vehicleId, ')..write('driverId: $driverId, ')..write('status: $status, ')..write('location: $location, ')..write('initialOdometer: $initialOdometer, ')..write('finalOdometer: $finalOdometer, ')..write('actualCash: $actualCash, ')..write('assignedOrdersJson: $assignedOrdersJson, ')..write('date: $date')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, vehicleId, driverId, status, location, initialOdometer, finalOdometer, actualCash, assignedOrdersJson, date);@override
bool operator ==(Object other) => identical(this, other) || (other is Route && other.id == this.id && other.tenantId == this.tenantId && other.vehicleId == this.vehicleId && other.driverId == this.driverId && other.status == this.status && other.location == this.location && other.initialOdometer == this.initialOdometer && other.finalOdometer == this.finalOdometer && other.actualCash == this.actualCash && other.assignedOrdersJson == this.assignedOrdersJson && other.date == this.date);
}class RoutesCompanion extends UpdateCompanion<Route> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> vehicleId;
final Value<String?> driverId;
final Value<String> status;
final Value<String?> location;
final Value<double?> initialOdometer;
final Value<double?> finalOdometer;
final Value<double?> actualCash;
final Value<String?> assignedOrdersJson;
final Value<DateTime> date;
final Value<int> rowid;
const RoutesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.vehicleId = const Value.absent(),this.driverId = const Value.absent(),this.status = const Value.absent(),this.location = const Value.absent(),this.initialOdometer = const Value.absent(),this.finalOdometer = const Value.absent(),this.actualCash = const Value.absent(),this.assignedOrdersJson = const Value.absent(),this.date = const Value.absent(),this.rowid = const Value.absent(),});
RoutesCompanion.insert({required String id,required String tenantId,this.vehicleId = const Value.absent(),this.driverId = const Value.absent(),required String status,this.location = const Value.absent(),this.initialOdometer = const Value.absent(),this.finalOdometer = const Value.absent(),this.actualCash = const Value.absent(),this.assignedOrdersJson = const Value.absent(),required DateTime date,this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), status = Value(status), date = Value(date);
static Insertable<Route> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? vehicleId, 
Expression<String>? driverId, 
Expression<String>? status, 
Expression<String>? location, 
Expression<double>? initialOdometer, 
Expression<double>? finalOdometer, 
Expression<double>? actualCash, 
Expression<String>? assignedOrdersJson, 
Expression<DateTime>? date, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (vehicleId != null)'vehicle_id': vehicleId,if (driverId != null)'driver_id': driverId,if (status != null)'status': status,if (location != null)'location': location,if (initialOdometer != null)'initial_odometer': initialOdometer,if (finalOdometer != null)'final_odometer': finalOdometer,if (actualCash != null)'actual_cash': actualCash,if (assignedOrdersJson != null)'assigned_orders_json': assignedOrdersJson,if (date != null)'date': date,if (rowid != null)'rowid': rowid,});
}RoutesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? vehicleId, Value<String?>? driverId, Value<String>? status, Value<String?>? location, Value<double?>? initialOdometer, Value<double?>? finalOdometer, Value<double?>? actualCash, Value<String?>? assignedOrdersJson, Value<DateTime>? date, Value<int>? rowid}) {
return RoutesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,vehicleId: vehicleId ?? this.vehicleId,driverId: driverId ?? this.driverId,status: status ?? this.status,location: location ?? this.location,initialOdometer: initialOdometer ?? this.initialOdometer,finalOdometer: finalOdometer ?? this.finalOdometer,actualCash: actualCash ?? this.actualCash,assignedOrdersJson: assignedOrdersJson ?? this.assignedOrdersJson,date: date ?? this.date,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (vehicleId.present) {
map['vehicle_id'] = Variable<String>(vehicleId.value);}
if (driverId.present) {
map['driver_id'] = Variable<String>(driverId.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (location.present) {
map['location'] = Variable<String>(location.value);}
if (initialOdometer.present) {
map['initial_odometer'] = Variable<double>(initialOdometer.value);}
if (finalOdometer.present) {
map['final_odometer'] = Variable<double>(finalOdometer.value);}
if (actualCash.present) {
map['actual_cash'] = Variable<double>(actualCash.value);}
if (assignedOrdersJson.present) {
map['assigned_orders_json'] = Variable<String>(assignedOrdersJson.value);}
if (date.present) {
map['date'] = Variable<DateTime>(date.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('RoutesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('vehicleId: $vehicleId, ')..write('driverId: $driverId, ')..write('status: $status, ')..write('location: $location, ')..write('initialOdometer: $initialOdometer, ')..write('finalOdometer: $finalOdometer, ')..write('actualCash: $actualCash, ')..write('assignedOrdersJson: $assignedOrdersJson, ')..write('date: $date, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $DayBookLocalTable extends DayBookLocal with TableInfo<$DayBookLocalTable, DayBookLocalData>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$DayBookLocalTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<String> date = GeneratedColumn<String>('date', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _locationIdMeta = const VerificationMeta('locationId');
@override
late final GeneratedColumn<String> locationId = GeneratedColumn<String>('location_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _openingBalanceMeta = const VerificationMeta('openingBalance');
@override
late final GeneratedColumn<double> openingBalance = GeneratedColumn<double>('opening_balance', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _closingBalanceMeta = const VerificationMeta('closingBalance');
@override
late final GeneratedColumn<double> closingBalance = GeneratedColumn<double>('closing_balance', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _totalSalesMeta = const VerificationMeta('totalSales');
@override
late final GeneratedColumn<double> totalSales = GeneratedColumn<double>('total_sales', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _totalExpensesMeta = const VerificationMeta('totalExpenses');
@override
late final GeneratedColumn<double> totalExpenses = GeneratedColumn<double>('total_expenses', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _isClosedMeta = const VerificationMeta('isClosed');
@override
late final GeneratedColumn<bool> isClosed = GeneratedColumn<bool>('is_closed', aliasedName, false, type: DriftSqlType.bool, requiredDuringInsert: false, defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("is_closed" IN (0, 1))'), defaultValue: const Constant(false));
static const VerificationMeta _closedAtMeta = const VerificationMeta('closedAt');
@override
late final GeneratedColumn<DateTime> closedAt = GeneratedColumn<DateTime>('closed_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
static const VerificationMeta _closedByMeta = const VerificationMeta('closedBy');
@override
late final GeneratedColumn<String> closedBy = GeneratedColumn<String>('closed_by', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _physicalCashMeta = const VerificationMeta('physicalCash');
@override
late final GeneratedColumn<double> physicalCash = GeneratedColumn<double>('physical_cash', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _varianceMeta = const VerificationMeta('variance');
@override
late final GeneratedColumn<double> variance = GeneratedColumn<double>('variance', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, date, locationId, openingBalance, closingBalance, totalSales, totalExpenses, isClosed, closedAt, closedBy, physicalCash, variance, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'day_book_local';
@override
VerificationContext validateIntegrity(Insertable<DayBookLocalData> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));} else if (isInserting) {
context.missing(_dateMeta);
}
if (data.containsKey('location_id')) {
context.handle(_locationIdMeta, locationId.isAcceptableOrUnknown(data['location_id']!, _locationIdMeta));}if (data.containsKey('opening_balance')) {
context.handle(_openingBalanceMeta, openingBalance.isAcceptableOrUnknown(data['opening_balance']!, _openingBalanceMeta));}if (data.containsKey('closing_balance')) {
context.handle(_closingBalanceMeta, closingBalance.isAcceptableOrUnknown(data['closing_balance']!, _closingBalanceMeta));}if (data.containsKey('total_sales')) {
context.handle(_totalSalesMeta, totalSales.isAcceptableOrUnknown(data['total_sales']!, _totalSalesMeta));}if (data.containsKey('total_expenses')) {
context.handle(_totalExpensesMeta, totalExpenses.isAcceptableOrUnknown(data['total_expenses']!, _totalExpensesMeta));}if (data.containsKey('is_closed')) {
context.handle(_isClosedMeta, isClosed.isAcceptableOrUnknown(data['is_closed']!, _isClosedMeta));}if (data.containsKey('closed_at')) {
context.handle(_closedAtMeta, closedAt.isAcceptableOrUnknown(data['closed_at']!, _closedAtMeta));}if (data.containsKey('closed_by')) {
context.handle(_closedByMeta, closedBy.isAcceptableOrUnknown(data['closed_by']!, _closedByMeta));}if (data.containsKey('physical_cash')) {
context.handle(_physicalCashMeta, physicalCash.isAcceptableOrUnknown(data['physical_cash']!, _physicalCashMeta));}if (data.containsKey('variance')) {
context.handle(_varianceMeta, variance.isAcceptableOrUnknown(data['variance']!, _varianceMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override DayBookLocalData map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return DayBookLocalData(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, date: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}date'])!, locationId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}location_id']), openingBalance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}opening_balance']), closingBalance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}closing_balance']), totalSales: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}total_sales']), totalExpenses: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}total_expenses']), isClosed: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}is_closed'])!, closedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}closed_at']), closedBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}closed_by']), physicalCash: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}physical_cash']), variance: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}variance']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$DayBookLocalTable createAlias(String alias) {
return $DayBookLocalTable(attachedDatabase, alias);}}class DayBookLocalData extends DataClass implements Insertable<DayBookLocalData> 
{
final String id;
final String tenantId;
final String date;
final String? locationId;
final double? openingBalance;
final double? closingBalance;
final double? totalSales;
final double? totalExpenses;
final bool isClosed;
final DateTime? closedAt;
final String? closedBy;
final double? physicalCash;
final double? variance;
final DateTime? updatedAt;
const DayBookLocalData({required this.id, required this.tenantId, required this.date, this.locationId, this.openingBalance, this.closingBalance, this.totalSales, this.totalExpenses, required this.isClosed, this.closedAt, this.closedBy, this.physicalCash, this.variance, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['date'] = Variable<String>(date);
if (!nullToAbsent || locationId != null){map['location_id'] = Variable<String>(locationId);
}if (!nullToAbsent || openingBalance != null){map['opening_balance'] = Variable<double>(openingBalance);
}if (!nullToAbsent || closingBalance != null){map['closing_balance'] = Variable<double>(closingBalance);
}if (!nullToAbsent || totalSales != null){map['total_sales'] = Variable<double>(totalSales);
}if (!nullToAbsent || totalExpenses != null){map['total_expenses'] = Variable<double>(totalExpenses);
}map['is_closed'] = Variable<bool>(isClosed);
if (!nullToAbsent || closedAt != null){map['closed_at'] = Variable<DateTime>(closedAt);
}if (!nullToAbsent || closedBy != null){map['closed_by'] = Variable<String>(closedBy);
}if (!nullToAbsent || physicalCash != null){map['physical_cash'] = Variable<double>(physicalCash);
}if (!nullToAbsent || variance != null){map['variance'] = Variable<double>(variance);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
DayBookLocalCompanion toCompanion(bool nullToAbsent) {
return DayBookLocalCompanion(id: Value(id),tenantId: Value(tenantId),date: Value(date),locationId: locationId == null && nullToAbsent ? const Value.absent() : Value(locationId),openingBalance: openingBalance == null && nullToAbsent ? const Value.absent() : Value(openingBalance),closingBalance: closingBalance == null && nullToAbsent ? const Value.absent() : Value(closingBalance),totalSales: totalSales == null && nullToAbsent ? const Value.absent() : Value(totalSales),totalExpenses: totalExpenses == null && nullToAbsent ? const Value.absent() : Value(totalExpenses),isClosed: Value(isClosed),closedAt: closedAt == null && nullToAbsent ? const Value.absent() : Value(closedAt),closedBy: closedBy == null && nullToAbsent ? const Value.absent() : Value(closedBy),physicalCash: physicalCash == null && nullToAbsent ? const Value.absent() : Value(physicalCash),variance: variance == null && nullToAbsent ? const Value.absent() : Value(variance),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory DayBookLocalData.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return DayBookLocalData(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),date: serializer.fromJson<String>(json['date']),locationId: serializer.fromJson<String?>(json['locationId']),openingBalance: serializer.fromJson<double?>(json['openingBalance']),closingBalance: serializer.fromJson<double?>(json['closingBalance']),totalSales: serializer.fromJson<double?>(json['totalSales']),totalExpenses: serializer.fromJson<double?>(json['totalExpenses']),isClosed: serializer.fromJson<bool>(json['isClosed']),closedAt: serializer.fromJson<DateTime?>(json['closedAt']),closedBy: serializer.fromJson<String?>(json['closedBy']),physicalCash: serializer.fromJson<double?>(json['physicalCash']),variance: serializer.fromJson<double?>(json['variance']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'date': serializer.toJson<String>(date),'locationId': serializer.toJson<String?>(locationId),'openingBalance': serializer.toJson<double?>(openingBalance),'closingBalance': serializer.toJson<double?>(closingBalance),'totalSales': serializer.toJson<double?>(totalSales),'totalExpenses': serializer.toJson<double?>(totalExpenses),'isClosed': serializer.toJson<bool>(isClosed),'closedAt': serializer.toJson<DateTime?>(closedAt),'closedBy': serializer.toJson<String?>(closedBy),'physicalCash': serializer.toJson<double?>(physicalCash),'variance': serializer.toJson<double?>(variance),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}DayBookLocalData copyWith({String? id,String? tenantId,String? date,Value<String?> locationId = const Value.absent(),Value<double?> openingBalance = const Value.absent(),Value<double?> closingBalance = const Value.absent(),Value<double?> totalSales = const Value.absent(),Value<double?> totalExpenses = const Value.absent(),bool? isClosed,Value<DateTime?> closedAt = const Value.absent(),Value<String?> closedBy = const Value.absent(),Value<double?> physicalCash = const Value.absent(),Value<double?> variance = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => DayBookLocalData(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,date: date ?? this.date,locationId: locationId.present ? locationId.value : this.locationId,openingBalance: openingBalance.present ? openingBalance.value : this.openingBalance,closingBalance: closingBalance.present ? closingBalance.value : this.closingBalance,totalSales: totalSales.present ? totalSales.value : this.totalSales,totalExpenses: totalExpenses.present ? totalExpenses.value : this.totalExpenses,isClosed: isClosed ?? this.isClosed,closedAt: closedAt.present ? closedAt.value : this.closedAt,closedBy: closedBy.present ? closedBy.value : this.closedBy,physicalCash: physicalCash.present ? physicalCash.value : this.physicalCash,variance: variance.present ? variance.value : this.variance,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);DayBookLocalData copyWithCompanion(DayBookLocalCompanion data) {
return DayBookLocalData(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,date: data.date.present ? data.date.value : this.date,locationId: data.locationId.present ? data.locationId.value : this.locationId,openingBalance: data.openingBalance.present ? data.openingBalance.value : this.openingBalance,closingBalance: data.closingBalance.present ? data.closingBalance.value : this.closingBalance,totalSales: data.totalSales.present ? data.totalSales.value : this.totalSales,totalExpenses: data.totalExpenses.present ? data.totalExpenses.value : this.totalExpenses,isClosed: data.isClosed.present ? data.isClosed.value : this.isClosed,closedAt: data.closedAt.present ? data.closedAt.value : this.closedAt,closedBy: data.closedBy.present ? data.closedBy.value : this.closedBy,physicalCash: data.physicalCash.present ? data.physicalCash.value : this.physicalCash,variance: data.variance.present ? data.variance.value : this.variance,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('DayBookLocalData(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('date: $date, ')..write('locationId: $locationId, ')..write('openingBalance: $openingBalance, ')..write('closingBalance: $closingBalance, ')..write('totalSales: $totalSales, ')..write('totalExpenses: $totalExpenses, ')..write('isClosed: $isClosed, ')..write('closedAt: $closedAt, ')..write('closedBy: $closedBy, ')..write('physicalCash: $physicalCash, ')..write('variance: $variance, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, date, locationId, openingBalance, closingBalance, totalSales, totalExpenses, isClosed, closedAt, closedBy, physicalCash, variance, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is DayBookLocalData && other.id == this.id && other.tenantId == this.tenantId && other.date == this.date && other.locationId == this.locationId && other.openingBalance == this.openingBalance && other.closingBalance == this.closingBalance && other.totalSales == this.totalSales && other.totalExpenses == this.totalExpenses && other.isClosed == this.isClosed && other.closedAt == this.closedAt && other.closedBy == this.closedBy && other.physicalCash == this.physicalCash && other.variance == this.variance && other.updatedAt == this.updatedAt);
}class DayBookLocalCompanion extends UpdateCompanion<DayBookLocalData> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> date;
final Value<String?> locationId;
final Value<double?> openingBalance;
final Value<double?> closingBalance;
final Value<double?> totalSales;
final Value<double?> totalExpenses;
final Value<bool> isClosed;
final Value<DateTime?> closedAt;
final Value<String?> closedBy;
final Value<double?> physicalCash;
final Value<double?> variance;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const DayBookLocalCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.date = const Value.absent(),this.locationId = const Value.absent(),this.openingBalance = const Value.absent(),this.closingBalance = const Value.absent(),this.totalSales = const Value.absent(),this.totalExpenses = const Value.absent(),this.isClosed = const Value.absent(),this.closedAt = const Value.absent(),this.closedBy = const Value.absent(),this.physicalCash = const Value.absent(),this.variance = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
DayBookLocalCompanion.insert({required String id,required String tenantId,required String date,this.locationId = const Value.absent(),this.openingBalance = const Value.absent(),this.closingBalance = const Value.absent(),this.totalSales = const Value.absent(),this.totalExpenses = const Value.absent(),this.isClosed = const Value.absent(),this.closedAt = const Value.absent(),this.closedBy = const Value.absent(),this.physicalCash = const Value.absent(),this.variance = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), date = Value(date);
static Insertable<DayBookLocalData> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? date, 
Expression<String>? locationId, 
Expression<double>? openingBalance, 
Expression<double>? closingBalance, 
Expression<double>? totalSales, 
Expression<double>? totalExpenses, 
Expression<bool>? isClosed, 
Expression<DateTime>? closedAt, 
Expression<String>? closedBy, 
Expression<double>? physicalCash, 
Expression<double>? variance, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (date != null)'date': date,if (locationId != null)'location_id': locationId,if (openingBalance != null)'opening_balance': openingBalance,if (closingBalance != null)'closing_balance': closingBalance,if (totalSales != null)'total_sales': totalSales,if (totalExpenses != null)'total_expenses': totalExpenses,if (isClosed != null)'is_closed': isClosed,if (closedAt != null)'closed_at': closedAt,if (closedBy != null)'closed_by': closedBy,if (physicalCash != null)'physical_cash': physicalCash,if (variance != null)'variance': variance,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}DayBookLocalCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? date, Value<String?>? locationId, Value<double?>? openingBalance, Value<double?>? closingBalance, Value<double?>? totalSales, Value<double?>? totalExpenses, Value<bool>? isClosed, Value<DateTime?>? closedAt, Value<String?>? closedBy, Value<double?>? physicalCash, Value<double?>? variance, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return DayBookLocalCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,date: date ?? this.date,locationId: locationId ?? this.locationId,openingBalance: openingBalance ?? this.openingBalance,closingBalance: closingBalance ?? this.closingBalance,totalSales: totalSales ?? this.totalSales,totalExpenses: totalExpenses ?? this.totalExpenses,isClosed: isClosed ?? this.isClosed,closedAt: closedAt ?? this.closedAt,closedBy: closedBy ?? this.closedBy,physicalCash: physicalCash ?? this.physicalCash,variance: variance ?? this.variance,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (date.present) {
map['date'] = Variable<String>(date.value);}
if (locationId.present) {
map['location_id'] = Variable<String>(locationId.value);}
if (openingBalance.present) {
map['opening_balance'] = Variable<double>(openingBalance.value);}
if (closingBalance.present) {
map['closing_balance'] = Variable<double>(closingBalance.value);}
if (totalSales.present) {
map['total_sales'] = Variable<double>(totalSales.value);}
if (totalExpenses.present) {
map['total_expenses'] = Variable<double>(totalExpenses.value);}
if (isClosed.present) {
map['is_closed'] = Variable<bool>(isClosed.value);}
if (closedAt.present) {
map['closed_at'] = Variable<DateTime>(closedAt.value);}
if (closedBy.present) {
map['closed_by'] = Variable<String>(closedBy.value);}
if (physicalCash.present) {
map['physical_cash'] = Variable<double>(physicalCash.value);}
if (variance.present) {
map['variance'] = Variable<double>(variance.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('DayBookLocalCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('date: $date, ')..write('locationId: $locationId, ')..write('openingBalance: $openingBalance, ')..write('closingBalance: $closingBalance, ')..write('totalSales: $totalSales, ')..write('totalExpenses: $totalExpenses, ')..write('isClosed: $isClosed, ')..write('closedAt: $closedAt, ')..write('closedBy: $closedBy, ')..write('physicalCash: $physicalCash, ')..write('variance: $variance, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $ClientPaymentsTable extends ClientPayments with TableInfo<$ClientPaymentsTable, ClientPayment>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$ClientPaymentsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _clientIdMeta = const VerificationMeta('clientId');
@override
late final GeneratedColumn<String> clientId = GeneratedColumn<String>('client_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _amountMeta = const VerificationMeta('amount');
@override
late final GeneratedColumn<double> amount = GeneratedColumn<double>('amount', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<String> date = GeneratedColumn<String>('date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _paymentMethodMeta = const VerificationMeta('paymentMethod');
@override
late final GeneratedColumn<String> paymentMethod = GeneratedColumn<String>('payment_method', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _notesMeta = const VerificationMeta('notes');
@override
late final GeneratedColumn<String> notes = GeneratedColumn<String>('notes', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _recordedByMeta = const VerificationMeta('recordedBy');
@override
late final GeneratedColumn<String> recordedBy = GeneratedColumn<String>('recorded_by', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, clientId, amount, date, paymentMethod, notes, recordedBy, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'client_payments';
@override
VerificationContext validateIntegrity(Insertable<ClientPayment> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('client_id')) {
context.handle(_clientIdMeta, clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));}if (data.containsKey('amount')) {
context.handle(_amountMeta, amount.isAcceptableOrUnknown(data['amount']!, _amountMeta));}if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));}if (data.containsKey('payment_method')) {
context.handle(_paymentMethodMeta, paymentMethod.isAcceptableOrUnknown(data['payment_method']!, _paymentMethodMeta));}if (data.containsKey('notes')) {
context.handle(_notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));}if (data.containsKey('recorded_by')) {
context.handle(_recordedByMeta, recordedBy.isAcceptableOrUnknown(data['recorded_by']!, _recordedByMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override ClientPayment map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return ClientPayment(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, clientId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_id']), amount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}amount']), date: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}date']), paymentMethod: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payment_method']), notes: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}notes']), recordedBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}recorded_by']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$ClientPaymentsTable createAlias(String alias) {
return $ClientPaymentsTable(attachedDatabase, alias);}}class ClientPayment extends DataClass implements Insertable<ClientPayment> 
{
final String id;
final String tenantId;
final String? clientId;
final double? amount;
final String? date;
final String? paymentMethod;
final String? notes;
final String? recordedBy;
final DateTime? updatedAt;
const ClientPayment({required this.id, required this.tenantId, this.clientId, this.amount, this.date, this.paymentMethod, this.notes, this.recordedBy, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || clientId != null){map['client_id'] = Variable<String>(clientId);
}if (!nullToAbsent || amount != null){map['amount'] = Variable<double>(amount);
}if (!nullToAbsent || date != null){map['date'] = Variable<String>(date);
}if (!nullToAbsent || paymentMethod != null){map['payment_method'] = Variable<String>(paymentMethod);
}if (!nullToAbsent || notes != null){map['notes'] = Variable<String>(notes);
}if (!nullToAbsent || recordedBy != null){map['recorded_by'] = Variable<String>(recordedBy);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
ClientPaymentsCompanion toCompanion(bool nullToAbsent) {
return ClientPaymentsCompanion(id: Value(id),tenantId: Value(tenantId),clientId: clientId == null && nullToAbsent ? const Value.absent() : Value(clientId),amount: amount == null && nullToAbsent ? const Value.absent() : Value(amount),date: date == null && nullToAbsent ? const Value.absent() : Value(date),paymentMethod: paymentMethod == null && nullToAbsent ? const Value.absent() : Value(paymentMethod),notes: notes == null && nullToAbsent ? const Value.absent() : Value(notes),recordedBy: recordedBy == null && nullToAbsent ? const Value.absent() : Value(recordedBy),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory ClientPayment.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return ClientPayment(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),clientId: serializer.fromJson<String?>(json['clientId']),amount: serializer.fromJson<double?>(json['amount']),date: serializer.fromJson<String?>(json['date']),paymentMethod: serializer.fromJson<String?>(json['paymentMethod']),notes: serializer.fromJson<String?>(json['notes']),recordedBy: serializer.fromJson<String?>(json['recordedBy']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'clientId': serializer.toJson<String?>(clientId),'amount': serializer.toJson<double?>(amount),'date': serializer.toJson<String?>(date),'paymentMethod': serializer.toJson<String?>(paymentMethod),'notes': serializer.toJson<String?>(notes),'recordedBy': serializer.toJson<String?>(recordedBy),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}ClientPayment copyWith({String? id,String? tenantId,Value<String?> clientId = const Value.absent(),Value<double?> amount = const Value.absent(),Value<String?> date = const Value.absent(),Value<String?> paymentMethod = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> recordedBy = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => ClientPayment(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,clientId: clientId.present ? clientId.value : this.clientId,amount: amount.present ? amount.value : this.amount,date: date.present ? date.value : this.date,paymentMethod: paymentMethod.present ? paymentMethod.value : this.paymentMethod,notes: notes.present ? notes.value : this.notes,recordedBy: recordedBy.present ? recordedBy.value : this.recordedBy,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);ClientPayment copyWithCompanion(ClientPaymentsCompanion data) {
return ClientPayment(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,clientId: data.clientId.present ? data.clientId.value : this.clientId,amount: data.amount.present ? data.amount.value : this.amount,date: data.date.present ? data.date.value : this.date,paymentMethod: data.paymentMethod.present ? data.paymentMethod.value : this.paymentMethod,notes: data.notes.present ? data.notes.value : this.notes,recordedBy: data.recordedBy.present ? data.recordedBy.value : this.recordedBy,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('ClientPayment(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('clientId: $clientId, ')..write('amount: $amount, ')..write('date: $date, ')..write('paymentMethod: $paymentMethod, ')..write('notes: $notes, ')..write('recordedBy: $recordedBy, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, clientId, amount, date, paymentMethod, notes, recordedBy, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is ClientPayment && other.id == this.id && other.tenantId == this.tenantId && other.clientId == this.clientId && other.amount == this.amount && other.date == this.date && other.paymentMethod == this.paymentMethod && other.notes == this.notes && other.recordedBy == this.recordedBy && other.updatedAt == this.updatedAt);
}class ClientPaymentsCompanion extends UpdateCompanion<ClientPayment> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> clientId;
final Value<double?> amount;
final Value<String?> date;
final Value<String?> paymentMethod;
final Value<String?> notes;
final Value<String?> recordedBy;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const ClientPaymentsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.clientId = const Value.absent(),this.amount = const Value.absent(),this.date = const Value.absent(),this.paymentMethod = const Value.absent(),this.notes = const Value.absent(),this.recordedBy = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
ClientPaymentsCompanion.insert({required String id,required String tenantId,this.clientId = const Value.absent(),this.amount = const Value.absent(),this.date = const Value.absent(),this.paymentMethod = const Value.absent(),this.notes = const Value.absent(),this.recordedBy = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<ClientPayment> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? clientId, 
Expression<double>? amount, 
Expression<String>? date, 
Expression<String>? paymentMethod, 
Expression<String>? notes, 
Expression<String>? recordedBy, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (clientId != null)'client_id': clientId,if (amount != null)'amount': amount,if (date != null)'date': date,if (paymentMethod != null)'payment_method': paymentMethod,if (notes != null)'notes': notes,if (recordedBy != null)'recorded_by': recordedBy,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}ClientPaymentsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? clientId, Value<double?>? amount, Value<String?>? date, Value<String?>? paymentMethod, Value<String?>? notes, Value<String?>? recordedBy, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return ClientPaymentsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,clientId: clientId ?? this.clientId,amount: amount ?? this.amount,date: date ?? this.date,paymentMethod: paymentMethod ?? this.paymentMethod,notes: notes ?? this.notes,recordedBy: recordedBy ?? this.recordedBy,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (clientId.present) {
map['client_id'] = Variable<String>(clientId.value);}
if (amount.present) {
map['amount'] = Variable<double>(amount.value);}
if (date.present) {
map['date'] = Variable<String>(date.value);}
if (paymentMethod.present) {
map['payment_method'] = Variable<String>(paymentMethod.value);}
if (notes.present) {
map['notes'] = Variable<String>(notes.value);}
if (recordedBy.present) {
map['recorded_by'] = Variable<String>(recordedBy.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('ClientPaymentsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('clientId: $clientId, ')..write('amount: $amount, ')..write('date: $date, ')..write('paymentMethod: $paymentMethod, ')..write('notes: $notes, ')..write('recordedBy: $recordedBy, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $EmployeesTable extends Employees with TableInfo<$EmployeesTable, Employee>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$EmployeesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _roleMeta = const VerificationMeta('role');
@override
late final GeneratedColumn<String> role = GeneratedColumn<String>('role', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _positionMeta = const VerificationMeta('position');
@override
late final GeneratedColumn<String> position = GeneratedColumn<String>('position', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _departmentMeta = const VerificationMeta('department');
@override
late final GeneratedColumn<String> department = GeneratedColumn<String>('department', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _payTypeMeta = const VerificationMeta('payType');
@override
late final GeneratedColumn<String> payType = GeneratedColumn<String>('pay_type', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _salaryMeta = const VerificationMeta('salary');
@override
late final GeneratedColumn<double> salary = GeneratedColumn<double>('salary', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _dailyRateMeta = const VerificationMeta('dailyRate');
@override
late final GeneratedColumn<double> dailyRate = GeneratedColumn<double>('daily_rate', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _daysWorkedMeta = const VerificationMeta('daysWorked');
@override
late final GeneratedColumn<double> daysWorked = GeneratedColumn<double>('days_worked', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _amountPaidMeta = const VerificationMeta('amountPaid');
@override
late final GeneratedColumn<double> amountPaid = GeneratedColumn<double>('amount_paid', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _phoneMeta = const VerificationMeta('phone');
@override
late final GeneratedColumn<String> phone = GeneratedColumn<String>('phone', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _emailMeta = const VerificationMeta('email');
@override
late final GeneratedColumn<String> email = GeneratedColumn<String>('email', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _bankAccountMeta = const VerificationMeta('bankAccount');
@override
late final GeneratedColumn<String> bankAccount = GeneratedColumn<String>('bank_account', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _employmentTypeMeta = const VerificationMeta('employmentType');
@override
late final GeneratedColumn<String> employmentType = GeneratedColumn<String>('employment_type', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _joiningDateMeta = const VerificationMeta('joiningDate');
@override
late final GeneratedColumn<String> joiningDate = GeneratedColumn<String>('joining_date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _notesMeta = const VerificationMeta('notes');
@override
late final GeneratedColumn<String> notes = GeneratedColumn<String>('notes', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _userIdMeta = const VerificationMeta('userId');
@override
late final GeneratedColumn<String> userId = GeneratedColumn<String>('user_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, role, position, department, status, payType, salary, dailyRate, daysWorked, amountPaid, phone, email, bankAccount, employmentType, joiningDate, notes, userId, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'employees';
@override
VerificationContext validateIntegrity(Insertable<Employee> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));}if (data.containsKey('role')) {
context.handle(_roleMeta, role.isAcceptableOrUnknown(data['role']!, _roleMeta));}if (data.containsKey('position')) {
context.handle(_positionMeta, position.isAcceptableOrUnknown(data['position']!, _positionMeta));}if (data.containsKey('department')) {
context.handle(_departmentMeta, department.isAcceptableOrUnknown(data['department']!, _departmentMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));}if (data.containsKey('pay_type')) {
context.handle(_payTypeMeta, payType.isAcceptableOrUnknown(data['pay_type']!, _payTypeMeta));}if (data.containsKey('salary')) {
context.handle(_salaryMeta, salary.isAcceptableOrUnknown(data['salary']!, _salaryMeta));}if (data.containsKey('daily_rate')) {
context.handle(_dailyRateMeta, dailyRate.isAcceptableOrUnknown(data['daily_rate']!, _dailyRateMeta));}if (data.containsKey('days_worked')) {
context.handle(_daysWorkedMeta, daysWorked.isAcceptableOrUnknown(data['days_worked']!, _daysWorkedMeta));}if (data.containsKey('amount_paid')) {
context.handle(_amountPaidMeta, amountPaid.isAcceptableOrUnknown(data['amount_paid']!, _amountPaidMeta));}if (data.containsKey('phone')) {
context.handle(_phoneMeta, phone.isAcceptableOrUnknown(data['phone']!, _phoneMeta));}if (data.containsKey('email')) {
context.handle(_emailMeta, email.isAcceptableOrUnknown(data['email']!, _emailMeta));}if (data.containsKey('bank_account')) {
context.handle(_bankAccountMeta, bankAccount.isAcceptableOrUnknown(data['bank_account']!, _bankAccountMeta));}if (data.containsKey('employment_type')) {
context.handle(_employmentTypeMeta, employmentType.isAcceptableOrUnknown(data['employment_type']!, _employmentTypeMeta));}if (data.containsKey('joining_date')) {
context.handle(_joiningDateMeta, joiningDate.isAcceptableOrUnknown(data['joining_date']!, _joiningDateMeta));}if (data.containsKey('notes')) {
context.handle(_notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));}if (data.containsKey('user_id')) {
context.handle(_userIdMeta, userId.isAcceptableOrUnknown(data['user_id']!, _userIdMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Employee map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Employee(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name']), role: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}role']), position: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}position']), department: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}department']), status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status']), payType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}pay_type']), salary: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}salary']), dailyRate: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}daily_rate']), daysWorked: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}days_worked']), amountPaid: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}amount_paid']), phone: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}phone']), email: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}email']), bankAccount: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}bank_account']), employmentType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}employment_type']), joiningDate: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}joining_date']), notes: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}notes']), userId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}user_id']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$EmployeesTable createAlias(String alias) {
return $EmployeesTable(attachedDatabase, alias);}}class Employee extends DataClass implements Insertable<Employee> 
{
final String id;
final String tenantId;
final String? name;
final String? role;
final String? position;
final String? department;
final String? status;
final String? payType;
final double? salary;
final double? dailyRate;
final double? daysWorked;
final double? amountPaid;
final String? phone;
final String? email;
final String? bankAccount;
final String? employmentType;
final String? joiningDate;
final String? notes;
final String? userId;
final DateTime? updatedAt;
const Employee({required this.id, required this.tenantId, this.name, this.role, this.position, this.department, this.status, this.payType, this.salary, this.dailyRate, this.daysWorked, this.amountPaid, this.phone, this.email, this.bankAccount, this.employmentType, this.joiningDate, this.notes, this.userId, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || name != null){map['name'] = Variable<String>(name);
}if (!nullToAbsent || role != null){map['role'] = Variable<String>(role);
}if (!nullToAbsent || position != null){map['position'] = Variable<String>(position);
}if (!nullToAbsent || department != null){map['department'] = Variable<String>(department);
}if (!nullToAbsent || status != null){map['status'] = Variable<String>(status);
}if (!nullToAbsent || payType != null){map['pay_type'] = Variable<String>(payType);
}if (!nullToAbsent || salary != null){map['salary'] = Variable<double>(salary);
}if (!nullToAbsent || dailyRate != null){map['daily_rate'] = Variable<double>(dailyRate);
}if (!nullToAbsent || daysWorked != null){map['days_worked'] = Variable<double>(daysWorked);
}if (!nullToAbsent || amountPaid != null){map['amount_paid'] = Variable<double>(amountPaid);
}if (!nullToAbsent || phone != null){map['phone'] = Variable<String>(phone);
}if (!nullToAbsent || email != null){map['email'] = Variable<String>(email);
}if (!nullToAbsent || bankAccount != null){map['bank_account'] = Variable<String>(bankAccount);
}if (!nullToAbsent || employmentType != null){map['employment_type'] = Variable<String>(employmentType);
}if (!nullToAbsent || joiningDate != null){map['joining_date'] = Variable<String>(joiningDate);
}if (!nullToAbsent || notes != null){map['notes'] = Variable<String>(notes);
}if (!nullToAbsent || userId != null){map['user_id'] = Variable<String>(userId);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
EmployeesCompanion toCompanion(bool nullToAbsent) {
return EmployeesCompanion(id: Value(id),tenantId: Value(tenantId),name: name == null && nullToAbsent ? const Value.absent() : Value(name),role: role == null && nullToAbsent ? const Value.absent() : Value(role),position: position == null && nullToAbsent ? const Value.absent() : Value(position),department: department == null && nullToAbsent ? const Value.absent() : Value(department),status: status == null && nullToAbsent ? const Value.absent() : Value(status),payType: payType == null && nullToAbsent ? const Value.absent() : Value(payType),salary: salary == null && nullToAbsent ? const Value.absent() : Value(salary),dailyRate: dailyRate == null && nullToAbsent ? const Value.absent() : Value(dailyRate),daysWorked: daysWorked == null && nullToAbsent ? const Value.absent() : Value(daysWorked),amountPaid: amountPaid == null && nullToAbsent ? const Value.absent() : Value(amountPaid),phone: phone == null && nullToAbsent ? const Value.absent() : Value(phone),email: email == null && nullToAbsent ? const Value.absent() : Value(email),bankAccount: bankAccount == null && nullToAbsent ? const Value.absent() : Value(bankAccount),employmentType: employmentType == null && nullToAbsent ? const Value.absent() : Value(employmentType),joiningDate: joiningDate == null && nullToAbsent ? const Value.absent() : Value(joiningDate),notes: notes == null && nullToAbsent ? const Value.absent() : Value(notes),userId: userId == null && nullToAbsent ? const Value.absent() : Value(userId),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory Employee.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Employee(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String?>(json['name']),role: serializer.fromJson<String?>(json['role']),position: serializer.fromJson<String?>(json['position']),department: serializer.fromJson<String?>(json['department']),status: serializer.fromJson<String?>(json['status']),payType: serializer.fromJson<String?>(json['payType']),salary: serializer.fromJson<double?>(json['salary']),dailyRate: serializer.fromJson<double?>(json['dailyRate']),daysWorked: serializer.fromJson<double?>(json['daysWorked']),amountPaid: serializer.fromJson<double?>(json['amountPaid']),phone: serializer.fromJson<String?>(json['phone']),email: serializer.fromJson<String?>(json['email']),bankAccount: serializer.fromJson<String?>(json['bankAccount']),employmentType: serializer.fromJson<String?>(json['employmentType']),joiningDate: serializer.fromJson<String?>(json['joiningDate']),notes: serializer.fromJson<String?>(json['notes']),userId: serializer.fromJson<String?>(json['userId']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String?>(name),'role': serializer.toJson<String?>(role),'position': serializer.toJson<String?>(position),'department': serializer.toJson<String?>(department),'status': serializer.toJson<String?>(status),'payType': serializer.toJson<String?>(payType),'salary': serializer.toJson<double?>(salary),'dailyRate': serializer.toJson<double?>(dailyRate),'daysWorked': serializer.toJson<double?>(daysWorked),'amountPaid': serializer.toJson<double?>(amountPaid),'phone': serializer.toJson<String?>(phone),'email': serializer.toJson<String?>(email),'bankAccount': serializer.toJson<String?>(bankAccount),'employmentType': serializer.toJson<String?>(employmentType),'joiningDate': serializer.toJson<String?>(joiningDate),'notes': serializer.toJson<String?>(notes),'userId': serializer.toJson<String?>(userId),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}Employee copyWith({String? id,String? tenantId,Value<String?> name = const Value.absent(),Value<String?> role = const Value.absent(),Value<String?> position = const Value.absent(),Value<String?> department = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> payType = const Value.absent(),Value<double?> salary = const Value.absent(),Value<double?> dailyRate = const Value.absent(),Value<double?> daysWorked = const Value.absent(),Value<double?> amountPaid = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> bankAccount = const Value.absent(),Value<String?> employmentType = const Value.absent(),Value<String?> joiningDate = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> userId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => Employee(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name.present ? name.value : this.name,role: role.present ? role.value : this.role,position: position.present ? position.value : this.position,department: department.present ? department.value : this.department,status: status.present ? status.value : this.status,payType: payType.present ? payType.value : this.payType,salary: salary.present ? salary.value : this.salary,dailyRate: dailyRate.present ? dailyRate.value : this.dailyRate,daysWorked: daysWorked.present ? daysWorked.value : this.daysWorked,amountPaid: amountPaid.present ? amountPaid.value : this.amountPaid,phone: phone.present ? phone.value : this.phone,email: email.present ? email.value : this.email,bankAccount: bankAccount.present ? bankAccount.value : this.bankAccount,employmentType: employmentType.present ? employmentType.value : this.employmentType,joiningDate: joiningDate.present ? joiningDate.value : this.joiningDate,notes: notes.present ? notes.value : this.notes,userId: userId.present ? userId.value : this.userId,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);Employee copyWithCompanion(EmployeesCompanion data) {
return Employee(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,role: data.role.present ? data.role.value : this.role,position: data.position.present ? data.position.value : this.position,department: data.department.present ? data.department.value : this.department,status: data.status.present ? data.status.value : this.status,payType: data.payType.present ? data.payType.value : this.payType,salary: data.salary.present ? data.salary.value : this.salary,dailyRate: data.dailyRate.present ? data.dailyRate.value : this.dailyRate,daysWorked: data.daysWorked.present ? data.daysWorked.value : this.daysWorked,amountPaid: data.amountPaid.present ? data.amountPaid.value : this.amountPaid,phone: data.phone.present ? data.phone.value : this.phone,email: data.email.present ? data.email.value : this.email,bankAccount: data.bankAccount.present ? data.bankAccount.value : this.bankAccount,employmentType: data.employmentType.present ? data.employmentType.value : this.employmentType,joiningDate: data.joiningDate.present ? data.joiningDate.value : this.joiningDate,notes: data.notes.present ? data.notes.value : this.notes,userId: data.userId.present ? data.userId.value : this.userId,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('Employee(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('role: $role, ')..write('position: $position, ')..write('department: $department, ')..write('status: $status, ')..write('payType: $payType, ')..write('salary: $salary, ')..write('dailyRate: $dailyRate, ')..write('daysWorked: $daysWorked, ')..write('amountPaid: $amountPaid, ')..write('phone: $phone, ')..write('email: $email, ')..write('bankAccount: $bankAccount, ')..write('employmentType: $employmentType, ')..write('joiningDate: $joiningDate, ')..write('notes: $notes, ')..write('userId: $userId, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, role, position, department, status, payType, salary, dailyRate, daysWorked, amountPaid, phone, email, bankAccount, employmentType, joiningDate, notes, userId, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Employee && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.role == this.role && other.position == this.position && other.department == this.department && other.status == this.status && other.payType == this.payType && other.salary == this.salary && other.dailyRate == this.dailyRate && other.daysWorked == this.daysWorked && other.amountPaid == this.amountPaid && other.phone == this.phone && other.email == this.email && other.bankAccount == this.bankAccount && other.employmentType == this.employmentType && other.joiningDate == this.joiningDate && other.notes == this.notes && other.userId == this.userId && other.updatedAt == this.updatedAt);
}class EmployeesCompanion extends UpdateCompanion<Employee> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> name;
final Value<String?> role;
final Value<String?> position;
final Value<String?> department;
final Value<String?> status;
final Value<String?> payType;
final Value<double?> salary;
final Value<double?> dailyRate;
final Value<double?> daysWorked;
final Value<double?> amountPaid;
final Value<String?> phone;
final Value<String?> email;
final Value<String?> bankAccount;
final Value<String?> employmentType;
final Value<String?> joiningDate;
final Value<String?> notes;
final Value<String?> userId;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const EmployeesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.role = const Value.absent(),this.position = const Value.absent(),this.department = const Value.absent(),this.status = const Value.absent(),this.payType = const Value.absent(),this.salary = const Value.absent(),this.dailyRate = const Value.absent(),this.daysWorked = const Value.absent(),this.amountPaid = const Value.absent(),this.phone = const Value.absent(),this.email = const Value.absent(),this.bankAccount = const Value.absent(),this.employmentType = const Value.absent(),this.joiningDate = const Value.absent(),this.notes = const Value.absent(),this.userId = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
EmployeesCompanion.insert({required String id,required String tenantId,this.name = const Value.absent(),this.role = const Value.absent(),this.position = const Value.absent(),this.department = const Value.absent(),this.status = const Value.absent(),this.payType = const Value.absent(),this.salary = const Value.absent(),this.dailyRate = const Value.absent(),this.daysWorked = const Value.absent(),this.amountPaid = const Value.absent(),this.phone = const Value.absent(),this.email = const Value.absent(),this.bankAccount = const Value.absent(),this.employmentType = const Value.absent(),this.joiningDate = const Value.absent(),this.notes = const Value.absent(),this.userId = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<Employee> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? role, 
Expression<String>? position, 
Expression<String>? department, 
Expression<String>? status, 
Expression<String>? payType, 
Expression<double>? salary, 
Expression<double>? dailyRate, 
Expression<double>? daysWorked, 
Expression<double>? amountPaid, 
Expression<String>? phone, 
Expression<String>? email, 
Expression<String>? bankAccount, 
Expression<String>? employmentType, 
Expression<String>? joiningDate, 
Expression<String>? notes, 
Expression<String>? userId, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (role != null)'role': role,if (position != null)'position': position,if (department != null)'department': department,if (status != null)'status': status,if (payType != null)'pay_type': payType,if (salary != null)'salary': salary,if (dailyRate != null)'daily_rate': dailyRate,if (daysWorked != null)'days_worked': daysWorked,if (amountPaid != null)'amount_paid': amountPaid,if (phone != null)'phone': phone,if (email != null)'email': email,if (bankAccount != null)'bank_account': bankAccount,if (employmentType != null)'employment_type': employmentType,if (joiningDate != null)'joining_date': joiningDate,if (notes != null)'notes': notes,if (userId != null)'user_id': userId,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}EmployeesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? name, Value<String?>? role, Value<String?>? position, Value<String?>? department, Value<String?>? status, Value<String?>? payType, Value<double?>? salary, Value<double?>? dailyRate, Value<double?>? daysWorked, Value<double?>? amountPaid, Value<String?>? phone, Value<String?>? email, Value<String?>? bankAccount, Value<String?>? employmentType, Value<String?>? joiningDate, Value<String?>? notes, Value<String?>? userId, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return EmployeesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,role: role ?? this.role,position: position ?? this.position,department: department ?? this.department,status: status ?? this.status,payType: payType ?? this.payType,salary: salary ?? this.salary,dailyRate: dailyRate ?? this.dailyRate,daysWorked: daysWorked ?? this.daysWorked,amountPaid: amountPaid ?? this.amountPaid,phone: phone ?? this.phone,email: email ?? this.email,bankAccount: bankAccount ?? this.bankAccount,employmentType: employmentType ?? this.employmentType,joiningDate: joiningDate ?? this.joiningDate,notes: notes ?? this.notes,userId: userId ?? this.userId,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (role.present) {
map['role'] = Variable<String>(role.value);}
if (position.present) {
map['position'] = Variable<String>(position.value);}
if (department.present) {
map['department'] = Variable<String>(department.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (payType.present) {
map['pay_type'] = Variable<String>(payType.value);}
if (salary.present) {
map['salary'] = Variable<double>(salary.value);}
if (dailyRate.present) {
map['daily_rate'] = Variable<double>(dailyRate.value);}
if (daysWorked.present) {
map['days_worked'] = Variable<double>(daysWorked.value);}
if (amountPaid.present) {
map['amount_paid'] = Variable<double>(amountPaid.value);}
if (phone.present) {
map['phone'] = Variable<String>(phone.value);}
if (email.present) {
map['email'] = Variable<String>(email.value);}
if (bankAccount.present) {
map['bank_account'] = Variable<String>(bankAccount.value);}
if (employmentType.present) {
map['employment_type'] = Variable<String>(employmentType.value);}
if (joiningDate.present) {
map['joining_date'] = Variable<String>(joiningDate.value);}
if (notes.present) {
map['notes'] = Variable<String>(notes.value);}
if (userId.present) {
map['user_id'] = Variable<String>(userId.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('EmployeesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('role: $role, ')..write('position: $position, ')..write('department: $department, ')..write('status: $status, ')..write('payType: $payType, ')..write('salary: $salary, ')..write('dailyRate: $dailyRate, ')..write('daysWorked: $daysWorked, ')..write('amountPaid: $amountPaid, ')..write('phone: $phone, ')..write('email: $email, ')..write('bankAccount: $bankAccount, ')..write('employmentType: $employmentType, ')..write('joiningDate: $joiningDate, ')..write('notes: $notes, ')..write('userId: $userId, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $InventoryLocationsTable extends InventoryLocations with TableInfo<$InventoryLocationsTable, InventoryLocation>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$InventoryLocationsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _typeMeta = const VerificationMeta('type');
@override
late final GeneratedColumn<String> type = GeneratedColumn<String>('type', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _referenceIdMeta = const VerificationMeta('referenceId');
@override
late final GeneratedColumn<String> referenceId = GeneratedColumn<String>('reference_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, type, referenceId, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'inventory_locations';
@override
VerificationContext validateIntegrity(Insertable<InventoryLocation> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));} else if (isInserting) {
context.missing(_nameMeta);
}
if (data.containsKey('type')) {
context.handle(_typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));} else if (isInserting) {
context.missing(_typeMeta);
}
if (data.containsKey('reference_id')) {
context.handle(_referenceIdMeta, referenceId.isAcceptableOrUnknown(data['reference_id']!, _referenceIdMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override InventoryLocation map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return InventoryLocation(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!, type: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}type'])!, referenceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}reference_id']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$InventoryLocationsTable createAlias(String alias) {
return $InventoryLocationsTable(attachedDatabase, alias);}}class InventoryLocation extends DataClass implements Insertable<InventoryLocation> 
{
final String id;
final String tenantId;
final String name;
final String type;
final String? referenceId;
final DateTime? updatedAt;
const InventoryLocation({required this.id, required this.tenantId, required this.name, required this.type, this.referenceId, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['name'] = Variable<String>(name);
map['type'] = Variable<String>(type);
if (!nullToAbsent || referenceId != null){map['reference_id'] = Variable<String>(referenceId);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
InventoryLocationsCompanion toCompanion(bool nullToAbsent) {
return InventoryLocationsCompanion(id: Value(id),tenantId: Value(tenantId),name: Value(name),type: Value(type),referenceId: referenceId == null && nullToAbsent ? const Value.absent() : Value(referenceId),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory InventoryLocation.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return InventoryLocation(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String>(json['name']),type: serializer.fromJson<String>(json['type']),referenceId: serializer.fromJson<String?>(json['referenceId']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String>(name),'type': serializer.toJson<String>(type),'referenceId': serializer.toJson<String?>(referenceId),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}InventoryLocation copyWith({String? id,String? tenantId,String? name,String? type,Value<String?> referenceId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => InventoryLocation(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,type: type ?? this.type,referenceId: referenceId.present ? referenceId.value : this.referenceId,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);InventoryLocation copyWithCompanion(InventoryLocationsCompanion data) {
return InventoryLocation(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,type: data.type.present ? data.type.value : this.type,referenceId: data.referenceId.present ? data.referenceId.value : this.referenceId,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('InventoryLocation(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('type: $type, ')..write('referenceId: $referenceId, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, type, referenceId, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is InventoryLocation && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.type == this.type && other.referenceId == this.referenceId && other.updatedAt == this.updatedAt);
}class InventoryLocationsCompanion extends UpdateCompanion<InventoryLocation> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> name;
final Value<String> type;
final Value<String?> referenceId;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const InventoryLocationsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.type = const Value.absent(),this.referenceId = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
InventoryLocationsCompanion.insert({required String id,required String tenantId,required String name,required String type,this.referenceId = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), name = Value(name), type = Value(type);
static Insertable<InventoryLocation> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? type, 
Expression<String>? referenceId, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (type != null)'type': type,if (referenceId != null)'reference_id': referenceId,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}InventoryLocationsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? name, Value<String>? type, Value<String?>? referenceId, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return InventoryLocationsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,type: type ?? this.type,referenceId: referenceId ?? this.referenceId,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (type.present) {
map['type'] = Variable<String>(type.value);}
if (referenceId.present) {
map['reference_id'] = Variable<String>(referenceId.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('InventoryLocationsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('type: $type, ')..write('referenceId: $referenceId, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $InventoryBalancesTable extends InventoryBalances with TableInfo<$InventoryBalancesTable, InventoryBalance>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$InventoryBalancesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _productIdMeta = const VerificationMeta('productId');
@override
late final GeneratedColumn<String> productId = GeneratedColumn<String>('product_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _locationIdMeta = const VerificationMeta('locationId');
@override
late final GeneratedColumn<String> locationId = GeneratedColumn<String>('location_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _quantityMeta = const VerificationMeta('quantity');
@override
late final GeneratedColumn<double> quantity = GeneratedColumn<double>('quantity', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, productId, locationId, quantity, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'inventory_balances';
@override
VerificationContext validateIntegrity(Insertable<InventoryBalance> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('product_id')) {
context.handle(_productIdMeta, productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta));} else if (isInserting) {
context.missing(_productIdMeta);
}
if (data.containsKey('location_id')) {
context.handle(_locationIdMeta, locationId.isAcceptableOrUnknown(data['location_id']!, _locationIdMeta));}if (data.containsKey('quantity')) {
context.handle(_quantityMeta, quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override InventoryBalance map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return InventoryBalance(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, productId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}product_id'])!, locationId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}location_id']), quantity: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}quantity']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$InventoryBalancesTable createAlias(String alias) {
return $InventoryBalancesTable(attachedDatabase, alias);}}class InventoryBalance extends DataClass implements Insertable<InventoryBalance> 
{
final String id;
final String tenantId;
final String productId;
final String? locationId;
final double? quantity;
final DateTime? updatedAt;
const InventoryBalance({required this.id, required this.tenantId, required this.productId, this.locationId, this.quantity, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['product_id'] = Variable<String>(productId);
if (!nullToAbsent || locationId != null){map['location_id'] = Variable<String>(locationId);
}if (!nullToAbsent || quantity != null){map['quantity'] = Variable<double>(quantity);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
InventoryBalancesCompanion toCompanion(bool nullToAbsent) {
return InventoryBalancesCompanion(id: Value(id),tenantId: Value(tenantId),productId: Value(productId),locationId: locationId == null && nullToAbsent ? const Value.absent() : Value(locationId),quantity: quantity == null && nullToAbsent ? const Value.absent() : Value(quantity),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory InventoryBalance.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return InventoryBalance(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),productId: serializer.fromJson<String>(json['productId']),locationId: serializer.fromJson<String?>(json['locationId']),quantity: serializer.fromJson<double?>(json['quantity']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'productId': serializer.toJson<String>(productId),'locationId': serializer.toJson<String?>(locationId),'quantity': serializer.toJson<double?>(quantity),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}InventoryBalance copyWith({String? id,String? tenantId,String? productId,Value<String?> locationId = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => InventoryBalance(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,productId: productId ?? this.productId,locationId: locationId.present ? locationId.value : this.locationId,quantity: quantity.present ? quantity.value : this.quantity,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);InventoryBalance copyWithCompanion(InventoryBalancesCompanion data) {
return InventoryBalance(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,productId: data.productId.present ? data.productId.value : this.productId,locationId: data.locationId.present ? data.locationId.value : this.locationId,quantity: data.quantity.present ? data.quantity.value : this.quantity,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('InventoryBalance(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('productId: $productId, ')..write('locationId: $locationId, ')..write('quantity: $quantity, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, productId, locationId, quantity, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is InventoryBalance && other.id == this.id && other.tenantId == this.tenantId && other.productId == this.productId && other.locationId == this.locationId && other.quantity == this.quantity && other.updatedAt == this.updatedAt);
}class InventoryBalancesCompanion extends UpdateCompanion<InventoryBalance> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> productId;
final Value<String?> locationId;
final Value<double?> quantity;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const InventoryBalancesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.productId = const Value.absent(),this.locationId = const Value.absent(),this.quantity = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
InventoryBalancesCompanion.insert({required String id,required String tenantId,required String productId,this.locationId = const Value.absent(),this.quantity = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), productId = Value(productId);
static Insertable<InventoryBalance> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? productId, 
Expression<String>? locationId, 
Expression<double>? quantity, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (productId != null)'product_id': productId,if (locationId != null)'location_id': locationId,if (quantity != null)'quantity': quantity,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}InventoryBalancesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? productId, Value<String?>? locationId, Value<double?>? quantity, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return InventoryBalancesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,productId: productId ?? this.productId,locationId: locationId ?? this.locationId,quantity: quantity ?? this.quantity,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (productId.present) {
map['product_id'] = Variable<String>(productId.value);}
if (locationId.present) {
map['location_id'] = Variable<String>(locationId.value);}
if (quantity.present) {
map['quantity'] = Variable<double>(quantity.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('InventoryBalancesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('productId: $productId, ')..write('locationId: $locationId, ')..write('quantity: $quantity, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $ProductBatchesTable extends ProductBatches with TableInfo<$ProductBatchesTable, ProductBatche>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$ProductBatchesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _productIdMeta = const VerificationMeta('productId');
@override
late final GeneratedColumn<String> productId = GeneratedColumn<String>('product_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _purchaseIdMeta = const VerificationMeta('purchaseId');
@override
late final GeneratedColumn<String> purchaseId = GeneratedColumn<String>('purchase_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _supplierIdMeta = const VerificationMeta('supplierId');
@override
late final GeneratedColumn<String> supplierId = GeneratedColumn<String>('supplier_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _warehouseIdMeta = const VerificationMeta('warehouseId');
@override
late final GeneratedColumn<String> warehouseId = GeneratedColumn<String>('warehouse_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _receivedDateMeta = const VerificationMeta('receivedDate');
@override
late final GeneratedColumn<String> receivedDate = GeneratedColumn<String>('received_date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _expiryDateMeta = const VerificationMeta('expiryDate');
@override
late final GeneratedColumn<String> expiryDate = GeneratedColumn<String>('expiry_date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _unitCostMeta = const VerificationMeta('unitCost');
@override
late final GeneratedColumn<double> unitCost = GeneratedColumn<double>('unit_cost', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _qtyReceivedMeta = const VerificationMeta('qtyReceived');
@override
late final GeneratedColumn<double> qtyReceived = GeneratedColumn<double>('qty_received', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _qtyRemainingMeta = const VerificationMeta('qtyRemaining');
@override
late final GeneratedColumn<double> qtyRemaining = GeneratedColumn<double>('qty_remaining', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _originMeta = const VerificationMeta('origin');
@override
late final GeneratedColumn<String> origin = GeneratedColumn<String>('origin', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _costBasisMeta = const VerificationMeta('costBasis');
@override
late final GeneratedColumn<String> costBasis = GeneratedColumn<String>('cost_basis', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _noteMeta = const VerificationMeta('note');
@override
late final GeneratedColumn<String> note = GeneratedColumn<String>('note', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, productId, purchaseId, supplierId, warehouseId, receivedDate, expiryDate, unitCost, qtyReceived, qtyRemaining, origin, costBasis, note, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'product_batches';
@override
VerificationContext validateIntegrity(Insertable<ProductBatche> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('product_id')) {
context.handle(_productIdMeta, productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta));} else if (isInserting) {
context.missing(_productIdMeta);
}
if (data.containsKey('purchase_id')) {
context.handle(_purchaseIdMeta, purchaseId.isAcceptableOrUnknown(data['purchase_id']!, _purchaseIdMeta));}if (data.containsKey('supplier_id')) {
context.handle(_supplierIdMeta, supplierId.isAcceptableOrUnknown(data['supplier_id']!, _supplierIdMeta));}if (data.containsKey('warehouse_id')) {
context.handle(_warehouseIdMeta, warehouseId.isAcceptableOrUnknown(data['warehouse_id']!, _warehouseIdMeta));}if (data.containsKey('received_date')) {
context.handle(_receivedDateMeta, receivedDate.isAcceptableOrUnknown(data['received_date']!, _receivedDateMeta));}if (data.containsKey('expiry_date')) {
context.handle(_expiryDateMeta, expiryDate.isAcceptableOrUnknown(data['expiry_date']!, _expiryDateMeta));}if (data.containsKey('unit_cost')) {
context.handle(_unitCostMeta, unitCost.isAcceptableOrUnknown(data['unit_cost']!, _unitCostMeta));}if (data.containsKey('qty_received')) {
context.handle(_qtyReceivedMeta, qtyReceived.isAcceptableOrUnknown(data['qty_received']!, _qtyReceivedMeta));}if (data.containsKey('qty_remaining')) {
context.handle(_qtyRemainingMeta, qtyRemaining.isAcceptableOrUnknown(data['qty_remaining']!, _qtyRemainingMeta));}if (data.containsKey('origin')) {
context.handle(_originMeta, origin.isAcceptableOrUnknown(data['origin']!, _originMeta));}if (data.containsKey('cost_basis')) {
context.handle(_costBasisMeta, costBasis.isAcceptableOrUnknown(data['cost_basis']!, _costBasisMeta));}if (data.containsKey('note')) {
context.handle(_noteMeta, note.isAcceptableOrUnknown(data['note']!, _noteMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override ProductBatche map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return ProductBatche(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, productId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}product_id'])!, purchaseId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}purchase_id']), supplierId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}supplier_id']), warehouseId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}warehouse_id']), receivedDate: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}received_date']), expiryDate: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}expiry_date']), unitCost: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}unit_cost']), qtyReceived: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}qty_received']), qtyRemaining: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}qty_remaining']), origin: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}origin']), costBasis: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}cost_basis']), note: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}note']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$ProductBatchesTable createAlias(String alias) {
return $ProductBatchesTable(attachedDatabase, alias);}}class ProductBatche extends DataClass implements Insertable<ProductBatche> 
{
final String id;
final String tenantId;
final String productId;
final String? purchaseId;
final String? supplierId;
final String? warehouseId;
final String? receivedDate;
final String? expiryDate;
final double? unitCost;
final double? qtyReceived;
final double? qtyRemaining;
final String? origin;
final String? costBasis;
final String? note;
final DateTime? updatedAt;
const ProductBatche({required this.id, required this.tenantId, required this.productId, this.purchaseId, this.supplierId, this.warehouseId, this.receivedDate, this.expiryDate, this.unitCost, this.qtyReceived, this.qtyRemaining, this.origin, this.costBasis, this.note, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['product_id'] = Variable<String>(productId);
if (!nullToAbsent || purchaseId != null){map['purchase_id'] = Variable<String>(purchaseId);
}if (!nullToAbsent || supplierId != null){map['supplier_id'] = Variable<String>(supplierId);
}if (!nullToAbsent || warehouseId != null){map['warehouse_id'] = Variable<String>(warehouseId);
}if (!nullToAbsent || receivedDate != null){map['received_date'] = Variable<String>(receivedDate);
}if (!nullToAbsent || expiryDate != null){map['expiry_date'] = Variable<String>(expiryDate);
}if (!nullToAbsent || unitCost != null){map['unit_cost'] = Variable<double>(unitCost);
}if (!nullToAbsent || qtyReceived != null){map['qty_received'] = Variable<double>(qtyReceived);
}if (!nullToAbsent || qtyRemaining != null){map['qty_remaining'] = Variable<double>(qtyRemaining);
}if (!nullToAbsent || origin != null){map['origin'] = Variable<String>(origin);
}if (!nullToAbsent || costBasis != null){map['cost_basis'] = Variable<String>(costBasis);
}if (!nullToAbsent || note != null){map['note'] = Variable<String>(note);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
ProductBatchesCompanion toCompanion(bool nullToAbsent) {
return ProductBatchesCompanion(id: Value(id),tenantId: Value(tenantId),productId: Value(productId),purchaseId: purchaseId == null && nullToAbsent ? const Value.absent() : Value(purchaseId),supplierId: supplierId == null && nullToAbsent ? const Value.absent() : Value(supplierId),warehouseId: warehouseId == null && nullToAbsent ? const Value.absent() : Value(warehouseId),receivedDate: receivedDate == null && nullToAbsent ? const Value.absent() : Value(receivedDate),expiryDate: expiryDate == null && nullToAbsent ? const Value.absent() : Value(expiryDate),unitCost: unitCost == null && nullToAbsent ? const Value.absent() : Value(unitCost),qtyReceived: qtyReceived == null && nullToAbsent ? const Value.absent() : Value(qtyReceived),qtyRemaining: qtyRemaining == null && nullToAbsent ? const Value.absent() : Value(qtyRemaining),origin: origin == null && nullToAbsent ? const Value.absent() : Value(origin),costBasis: costBasis == null && nullToAbsent ? const Value.absent() : Value(costBasis),note: note == null && nullToAbsent ? const Value.absent() : Value(note),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory ProductBatche.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return ProductBatche(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),productId: serializer.fromJson<String>(json['productId']),purchaseId: serializer.fromJson<String?>(json['purchaseId']),supplierId: serializer.fromJson<String?>(json['supplierId']),warehouseId: serializer.fromJson<String?>(json['warehouseId']),receivedDate: serializer.fromJson<String?>(json['receivedDate']),expiryDate: serializer.fromJson<String?>(json['expiryDate']),unitCost: serializer.fromJson<double?>(json['unitCost']),qtyReceived: serializer.fromJson<double?>(json['qtyReceived']),qtyRemaining: serializer.fromJson<double?>(json['qtyRemaining']),origin: serializer.fromJson<String?>(json['origin']),costBasis: serializer.fromJson<String?>(json['costBasis']),note: serializer.fromJson<String?>(json['note']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'productId': serializer.toJson<String>(productId),'purchaseId': serializer.toJson<String?>(purchaseId),'supplierId': serializer.toJson<String?>(supplierId),'warehouseId': serializer.toJson<String?>(warehouseId),'receivedDate': serializer.toJson<String?>(receivedDate),'expiryDate': serializer.toJson<String?>(expiryDate),'unitCost': serializer.toJson<double?>(unitCost),'qtyReceived': serializer.toJson<double?>(qtyReceived),'qtyRemaining': serializer.toJson<double?>(qtyRemaining),'origin': serializer.toJson<String?>(origin),'costBasis': serializer.toJson<String?>(costBasis),'note': serializer.toJson<String?>(note),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}ProductBatche copyWith({String? id,String? tenantId,String? productId,Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> warehouseId = const Value.absent(),Value<String?> receivedDate = const Value.absent(),Value<String?> expiryDate = const Value.absent(),Value<double?> unitCost = const Value.absent(),Value<double?> qtyReceived = const Value.absent(),Value<double?> qtyRemaining = const Value.absent(),Value<String?> origin = const Value.absent(),Value<String?> costBasis = const Value.absent(),Value<String?> note = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => ProductBatche(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,productId: productId ?? this.productId,purchaseId: purchaseId.present ? purchaseId.value : this.purchaseId,supplierId: supplierId.present ? supplierId.value : this.supplierId,warehouseId: warehouseId.present ? warehouseId.value : this.warehouseId,receivedDate: receivedDate.present ? receivedDate.value : this.receivedDate,expiryDate: expiryDate.present ? expiryDate.value : this.expiryDate,unitCost: unitCost.present ? unitCost.value : this.unitCost,qtyReceived: qtyReceived.present ? qtyReceived.value : this.qtyReceived,qtyRemaining: qtyRemaining.present ? qtyRemaining.value : this.qtyRemaining,origin: origin.present ? origin.value : this.origin,costBasis: costBasis.present ? costBasis.value : this.costBasis,note: note.present ? note.value : this.note,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);ProductBatche copyWithCompanion(ProductBatchesCompanion data) {
return ProductBatche(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,productId: data.productId.present ? data.productId.value : this.productId,purchaseId: data.purchaseId.present ? data.purchaseId.value : this.purchaseId,supplierId: data.supplierId.present ? data.supplierId.value : this.supplierId,warehouseId: data.warehouseId.present ? data.warehouseId.value : this.warehouseId,receivedDate: data.receivedDate.present ? data.receivedDate.value : this.receivedDate,expiryDate: data.expiryDate.present ? data.expiryDate.value : this.expiryDate,unitCost: data.unitCost.present ? data.unitCost.value : this.unitCost,qtyReceived: data.qtyReceived.present ? data.qtyReceived.value : this.qtyReceived,qtyRemaining: data.qtyRemaining.present ? data.qtyRemaining.value : this.qtyRemaining,origin: data.origin.present ? data.origin.value : this.origin,costBasis: data.costBasis.present ? data.costBasis.value : this.costBasis,note: data.note.present ? data.note.value : this.note,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('ProductBatche(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('productId: $productId, ')..write('purchaseId: $purchaseId, ')..write('supplierId: $supplierId, ')..write('warehouseId: $warehouseId, ')..write('receivedDate: $receivedDate, ')..write('expiryDate: $expiryDate, ')..write('unitCost: $unitCost, ')..write('qtyReceived: $qtyReceived, ')..write('qtyRemaining: $qtyRemaining, ')..write('origin: $origin, ')..write('costBasis: $costBasis, ')..write('note: $note, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, productId, purchaseId, supplierId, warehouseId, receivedDate, expiryDate, unitCost, qtyReceived, qtyRemaining, origin, costBasis, note, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is ProductBatche && other.id == this.id && other.tenantId == this.tenantId && other.productId == this.productId && other.purchaseId == this.purchaseId && other.supplierId == this.supplierId && other.warehouseId == this.warehouseId && other.receivedDate == this.receivedDate && other.expiryDate == this.expiryDate && other.unitCost == this.unitCost && other.qtyReceived == this.qtyReceived && other.qtyRemaining == this.qtyRemaining && other.origin == this.origin && other.costBasis == this.costBasis && other.note == this.note && other.updatedAt == this.updatedAt);
}class ProductBatchesCompanion extends UpdateCompanion<ProductBatche> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> productId;
final Value<String?> purchaseId;
final Value<String?> supplierId;
final Value<String?> warehouseId;
final Value<String?> receivedDate;
final Value<String?> expiryDate;
final Value<double?> unitCost;
final Value<double?> qtyReceived;
final Value<double?> qtyRemaining;
final Value<String?> origin;
final Value<String?> costBasis;
final Value<String?> note;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const ProductBatchesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.productId = const Value.absent(),this.purchaseId = const Value.absent(),this.supplierId = const Value.absent(),this.warehouseId = const Value.absent(),this.receivedDate = const Value.absent(),this.expiryDate = const Value.absent(),this.unitCost = const Value.absent(),this.qtyReceived = const Value.absent(),this.qtyRemaining = const Value.absent(),this.origin = const Value.absent(),this.costBasis = const Value.absent(),this.note = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
ProductBatchesCompanion.insert({required String id,required String tenantId,required String productId,this.purchaseId = const Value.absent(),this.supplierId = const Value.absent(),this.warehouseId = const Value.absent(),this.receivedDate = const Value.absent(),this.expiryDate = const Value.absent(),this.unitCost = const Value.absent(),this.qtyReceived = const Value.absent(),this.qtyRemaining = const Value.absent(),this.origin = const Value.absent(),this.costBasis = const Value.absent(),this.note = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), productId = Value(productId);
static Insertable<ProductBatche> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? productId, 
Expression<String>? purchaseId, 
Expression<String>? supplierId, 
Expression<String>? warehouseId, 
Expression<String>? receivedDate, 
Expression<String>? expiryDate, 
Expression<double>? unitCost, 
Expression<double>? qtyReceived, 
Expression<double>? qtyRemaining, 
Expression<String>? origin, 
Expression<String>? costBasis, 
Expression<String>? note, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (productId != null)'product_id': productId,if (purchaseId != null)'purchase_id': purchaseId,if (supplierId != null)'supplier_id': supplierId,if (warehouseId != null)'warehouse_id': warehouseId,if (receivedDate != null)'received_date': receivedDate,if (expiryDate != null)'expiry_date': expiryDate,if (unitCost != null)'unit_cost': unitCost,if (qtyReceived != null)'qty_received': qtyReceived,if (qtyRemaining != null)'qty_remaining': qtyRemaining,if (origin != null)'origin': origin,if (costBasis != null)'cost_basis': costBasis,if (note != null)'note': note,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}ProductBatchesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? productId, Value<String?>? purchaseId, Value<String?>? supplierId, Value<String?>? warehouseId, Value<String?>? receivedDate, Value<String?>? expiryDate, Value<double?>? unitCost, Value<double?>? qtyReceived, Value<double?>? qtyRemaining, Value<String?>? origin, Value<String?>? costBasis, Value<String?>? note, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return ProductBatchesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,productId: productId ?? this.productId,purchaseId: purchaseId ?? this.purchaseId,supplierId: supplierId ?? this.supplierId,warehouseId: warehouseId ?? this.warehouseId,receivedDate: receivedDate ?? this.receivedDate,expiryDate: expiryDate ?? this.expiryDate,unitCost: unitCost ?? this.unitCost,qtyReceived: qtyReceived ?? this.qtyReceived,qtyRemaining: qtyRemaining ?? this.qtyRemaining,origin: origin ?? this.origin,costBasis: costBasis ?? this.costBasis,note: note ?? this.note,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (productId.present) {
map['product_id'] = Variable<String>(productId.value);}
if (purchaseId.present) {
map['purchase_id'] = Variable<String>(purchaseId.value);}
if (supplierId.present) {
map['supplier_id'] = Variable<String>(supplierId.value);}
if (warehouseId.present) {
map['warehouse_id'] = Variable<String>(warehouseId.value);}
if (receivedDate.present) {
map['received_date'] = Variable<String>(receivedDate.value);}
if (expiryDate.present) {
map['expiry_date'] = Variable<String>(expiryDate.value);}
if (unitCost.present) {
map['unit_cost'] = Variable<double>(unitCost.value);}
if (qtyReceived.present) {
map['qty_received'] = Variable<double>(qtyReceived.value);}
if (qtyRemaining.present) {
map['qty_remaining'] = Variable<double>(qtyRemaining.value);}
if (origin.present) {
map['origin'] = Variable<String>(origin.value);}
if (costBasis.present) {
map['cost_basis'] = Variable<String>(costBasis.value);}
if (note.present) {
map['note'] = Variable<String>(note.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('ProductBatchesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('productId: $productId, ')..write('purchaseId: $purchaseId, ')..write('supplierId: $supplierId, ')..write('warehouseId: $warehouseId, ')..write('receivedDate: $receivedDate, ')..write('expiryDate: $expiryDate, ')..write('unitCost: $unitCost, ')..write('qtyReceived: $qtyReceived, ')..write('qtyRemaining: $qtyRemaining, ')..write('origin: $origin, ')..write('costBasis: $costBasis, ')..write('note: $note, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $VehiclesTable extends Vehicles with TableInfo<$VehiclesTable, Vehicle>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$VehiclesTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _plateNumberMeta = const VerificationMeta('plateNumber');
@override
late final GeneratedColumn<String> plateNumber = GeneratedColumn<String>('plate_number', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _typeMeta = const VerificationMeta('type');
@override
late final GeneratedColumn<String> type = GeneratedColumn<String>('type', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _capacityMeta = const VerificationMeta('capacity');
@override
late final GeneratedColumn<double> capacity = GeneratedColumn<double>('capacity', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _fuelTypeMeta = const VerificationMeta('fuelType');
@override
late final GeneratedColumn<String> fuelType = GeneratedColumn<String>('fuel_type', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, plateNumber, type, status, capacity, fuelType, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'vehicles';
@override
VerificationContext validateIntegrity(Insertable<Vehicle> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));}if (data.containsKey('plate_number')) {
context.handle(_plateNumberMeta, plateNumber.isAcceptableOrUnknown(data['plate_number']!, _plateNumberMeta));}if (data.containsKey('type')) {
context.handle(_typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));}if (data.containsKey('capacity')) {
context.handle(_capacityMeta, capacity.isAcceptableOrUnknown(data['capacity']!, _capacityMeta));}if (data.containsKey('fuel_type')) {
context.handle(_fuelTypeMeta, fuelType.isAcceptableOrUnknown(data['fuel_type']!, _fuelTypeMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override Vehicle map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return Vehicle(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name']), plateNumber: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}plate_number']), type: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}type']), status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status']), capacity: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}capacity']), fuelType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}fuel_type']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$VehiclesTable createAlias(String alias) {
return $VehiclesTable(attachedDatabase, alias);}}class Vehicle extends DataClass implements Insertable<Vehicle> 
{
final String id;
final String tenantId;
final String? name;
final String? plateNumber;
final String? type;
final String? status;
final double? capacity;
final String? fuelType;
final DateTime? updatedAt;
const Vehicle({required this.id, required this.tenantId, this.name, this.plateNumber, this.type, this.status, this.capacity, this.fuelType, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || name != null){map['name'] = Variable<String>(name);
}if (!nullToAbsent || plateNumber != null){map['plate_number'] = Variable<String>(plateNumber);
}if (!nullToAbsent || type != null){map['type'] = Variable<String>(type);
}if (!nullToAbsent || status != null){map['status'] = Variable<String>(status);
}if (!nullToAbsent || capacity != null){map['capacity'] = Variable<double>(capacity);
}if (!nullToAbsent || fuelType != null){map['fuel_type'] = Variable<String>(fuelType);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
VehiclesCompanion toCompanion(bool nullToAbsent) {
return VehiclesCompanion(id: Value(id),tenantId: Value(tenantId),name: name == null && nullToAbsent ? const Value.absent() : Value(name),plateNumber: plateNumber == null && nullToAbsent ? const Value.absent() : Value(plateNumber),type: type == null && nullToAbsent ? const Value.absent() : Value(type),status: status == null && nullToAbsent ? const Value.absent() : Value(status),capacity: capacity == null && nullToAbsent ? const Value.absent() : Value(capacity),fuelType: fuelType == null && nullToAbsent ? const Value.absent() : Value(fuelType),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory Vehicle.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return Vehicle(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String?>(json['name']),plateNumber: serializer.fromJson<String?>(json['plateNumber']),type: serializer.fromJson<String?>(json['type']),status: serializer.fromJson<String?>(json['status']),capacity: serializer.fromJson<double?>(json['capacity']),fuelType: serializer.fromJson<String?>(json['fuelType']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String?>(name),'plateNumber': serializer.toJson<String?>(plateNumber),'type': serializer.toJson<String?>(type),'status': serializer.toJson<String?>(status),'capacity': serializer.toJson<double?>(capacity),'fuelType': serializer.toJson<String?>(fuelType),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}Vehicle copyWith({String? id,String? tenantId,Value<String?> name = const Value.absent(),Value<String?> plateNumber = const Value.absent(),Value<String?> type = const Value.absent(),Value<String?> status = const Value.absent(),Value<double?> capacity = const Value.absent(),Value<String?> fuelType = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => Vehicle(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name.present ? name.value : this.name,plateNumber: plateNumber.present ? plateNumber.value : this.plateNumber,type: type.present ? type.value : this.type,status: status.present ? status.value : this.status,capacity: capacity.present ? capacity.value : this.capacity,fuelType: fuelType.present ? fuelType.value : this.fuelType,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);Vehicle copyWithCompanion(VehiclesCompanion data) {
return Vehicle(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,plateNumber: data.plateNumber.present ? data.plateNumber.value : this.plateNumber,type: data.type.present ? data.type.value : this.type,status: data.status.present ? data.status.value : this.status,capacity: data.capacity.present ? data.capacity.value : this.capacity,fuelType: data.fuelType.present ? data.fuelType.value : this.fuelType,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('Vehicle(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('plateNumber: $plateNumber, ')..write('type: $type, ')..write('status: $status, ')..write('capacity: $capacity, ')..write('fuelType: $fuelType, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, plateNumber, type, status, capacity, fuelType, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is Vehicle && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.plateNumber == this.plateNumber && other.type == this.type && other.status == this.status && other.capacity == this.capacity && other.fuelType == this.fuelType && other.updatedAt == this.updatedAt);
}class VehiclesCompanion extends UpdateCompanion<Vehicle> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> name;
final Value<String?> plateNumber;
final Value<String?> type;
final Value<String?> status;
final Value<double?> capacity;
final Value<String?> fuelType;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const VehiclesCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.plateNumber = const Value.absent(),this.type = const Value.absent(),this.status = const Value.absent(),this.capacity = const Value.absent(),this.fuelType = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
VehiclesCompanion.insert({required String id,required String tenantId,this.name = const Value.absent(),this.plateNumber = const Value.absent(),this.type = const Value.absent(),this.status = const Value.absent(),this.capacity = const Value.absent(),this.fuelType = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<Vehicle> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? plateNumber, 
Expression<String>? type, 
Expression<String>? status, 
Expression<double>? capacity, 
Expression<String>? fuelType, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (plateNumber != null)'plate_number': plateNumber,if (type != null)'type': type,if (status != null)'status': status,if (capacity != null)'capacity': capacity,if (fuelType != null)'fuel_type': fuelType,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}VehiclesCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? name, Value<String?>? plateNumber, Value<String?>? type, Value<String?>? status, Value<double?>? capacity, Value<String?>? fuelType, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return VehiclesCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,plateNumber: plateNumber ?? this.plateNumber,type: type ?? this.type,status: status ?? this.status,capacity: capacity ?? this.capacity,fuelType: fuelType ?? this.fuelType,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (plateNumber.present) {
map['plate_number'] = Variable<String>(plateNumber.value);}
if (type.present) {
map['type'] = Variable<String>(type.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (capacity.present) {
map['capacity'] = Variable<double>(capacity.value);}
if (fuelType.present) {
map['fuel_type'] = Variable<String>(fuelType.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('VehiclesCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('plateNumber: $plateNumber, ')..write('type: $type, ')..write('status: $status, ')..write('capacity: $capacity, ')..write('fuelType: $fuelType, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $RouteStopsTable extends RouteStops with TableInfo<$RouteStopsTable, RouteStop>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$RouteStopsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _routeIdMeta = const VerificationMeta('routeId');
@override
late final GeneratedColumn<String> routeId = GeneratedColumn<String>('route_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _invoiceIdMeta = const VerificationMeta('invoiceId');
@override
late final GeneratedColumn<String> invoiceId = GeneratedColumn<String>('invoice_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _clientIdMeta = const VerificationMeta('clientId');
@override
late final GeneratedColumn<String> clientId = GeneratedColumn<String>('client_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _clientNameMeta = const VerificationMeta('clientName');
@override
late final GeneratedColumn<String> clientName = GeneratedColumn<String>('client_name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _sequenceMeta = const VerificationMeta('sequence');
@override
late final GeneratedColumn<int> sequence = GeneratedColumn<int>('sequence', aliasedName, true, type: DriftSqlType.int, requiredDuringInsert: false);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _notesMeta = const VerificationMeta('notes');
@override
late final GeneratedColumn<String> notes = GeneratedColumn<String>('notes', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _cashCollectedMeta = const VerificationMeta('cashCollected');
@override
late final GeneratedColumn<double> cashCollected = GeneratedColumn<double>('cash_collected', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _itemsDeliveredJsonMeta = const VerificationMeta('itemsDeliveredJson');
@override
late final GeneratedColumn<String> itemsDeliveredJson = GeneratedColumn<String>('items_delivered_json', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _visitedAtMeta = const VerificationMeta('visitedAt');
@override
late final GeneratedColumn<DateTime> visitedAt = GeneratedColumn<DateTime>('visited_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, routeId, invoiceId, clientId, clientName, sequence, status, notes, cashCollected, itemsDeliveredJson, visitedAt, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'route_stops';
@override
VerificationContext validateIntegrity(Insertable<RouteStop> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('route_id')) {
context.handle(_routeIdMeta, routeId.isAcceptableOrUnknown(data['route_id']!, _routeIdMeta));} else if (isInserting) {
context.missing(_routeIdMeta);
}
if (data.containsKey('invoice_id')) {
context.handle(_invoiceIdMeta, invoiceId.isAcceptableOrUnknown(data['invoice_id']!, _invoiceIdMeta));}if (data.containsKey('client_id')) {
context.handle(_clientIdMeta, clientId.isAcceptableOrUnknown(data['client_id']!, _clientIdMeta));}if (data.containsKey('client_name')) {
context.handle(_clientNameMeta, clientName.isAcceptableOrUnknown(data['client_name']!, _clientNameMeta));}if (data.containsKey('sequence')) {
context.handle(_sequenceMeta, sequence.isAcceptableOrUnknown(data['sequence']!, _sequenceMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));}if (data.containsKey('notes')) {
context.handle(_notesMeta, notes.isAcceptableOrUnknown(data['notes']!, _notesMeta));}if (data.containsKey('cash_collected')) {
context.handle(_cashCollectedMeta, cashCollected.isAcceptableOrUnknown(data['cash_collected']!, _cashCollectedMeta));}if (data.containsKey('items_delivered_json')) {
context.handle(_itemsDeliveredJsonMeta, itemsDeliveredJson.isAcceptableOrUnknown(data['items_delivered_json']!, _itemsDeliveredJsonMeta));}if (data.containsKey('visited_at')) {
context.handle(_visitedAtMeta, visitedAt.isAcceptableOrUnknown(data['visited_at']!, _visitedAtMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override RouteStop map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return RouteStop(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, routeId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}route_id'])!, invoiceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}invoice_id']), clientId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_id']), clientName: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}client_name']), sequence: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}sequence']), status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status']), notes: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}notes']), cashCollected: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}cash_collected']), itemsDeliveredJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}items_delivered_json']), visitedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}visited_at']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$RouteStopsTable createAlias(String alias) {
return $RouteStopsTable(attachedDatabase, alias);}}class RouteStop extends DataClass implements Insertable<RouteStop> 
{
final String id;
final String tenantId;
final String routeId;
final String? invoiceId;
final String? clientId;
final String? clientName;
final int? sequence;
final String? status;
final String? notes;
final double? cashCollected;
final String? itemsDeliveredJson;
final DateTime? visitedAt;
final DateTime? updatedAt;
const RouteStop({required this.id, required this.tenantId, required this.routeId, this.invoiceId, this.clientId, this.clientName, this.sequence, this.status, this.notes, this.cashCollected, this.itemsDeliveredJson, this.visitedAt, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
map['route_id'] = Variable<String>(routeId);
if (!nullToAbsent || invoiceId != null){map['invoice_id'] = Variable<String>(invoiceId);
}if (!nullToAbsent || clientId != null){map['client_id'] = Variable<String>(clientId);
}if (!nullToAbsent || clientName != null){map['client_name'] = Variable<String>(clientName);
}if (!nullToAbsent || sequence != null){map['sequence'] = Variable<int>(sequence);
}if (!nullToAbsent || status != null){map['status'] = Variable<String>(status);
}if (!nullToAbsent || notes != null){map['notes'] = Variable<String>(notes);
}if (!nullToAbsent || cashCollected != null){map['cash_collected'] = Variable<double>(cashCollected);
}if (!nullToAbsent || itemsDeliveredJson != null){map['items_delivered_json'] = Variable<String>(itemsDeliveredJson);
}if (!nullToAbsent || visitedAt != null){map['visited_at'] = Variable<DateTime>(visitedAt);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
RouteStopsCompanion toCompanion(bool nullToAbsent) {
return RouteStopsCompanion(id: Value(id),tenantId: Value(tenantId),routeId: Value(routeId),invoiceId: invoiceId == null && nullToAbsent ? const Value.absent() : Value(invoiceId),clientId: clientId == null && nullToAbsent ? const Value.absent() : Value(clientId),clientName: clientName == null && nullToAbsent ? const Value.absent() : Value(clientName),sequence: sequence == null && nullToAbsent ? const Value.absent() : Value(sequence),status: status == null && nullToAbsent ? const Value.absent() : Value(status),notes: notes == null && nullToAbsent ? const Value.absent() : Value(notes),cashCollected: cashCollected == null && nullToAbsent ? const Value.absent() : Value(cashCollected),itemsDeliveredJson: itemsDeliveredJson == null && nullToAbsent ? const Value.absent() : Value(itemsDeliveredJson),visitedAt: visitedAt == null && nullToAbsent ? const Value.absent() : Value(visitedAt),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory RouteStop.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return RouteStop(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),routeId: serializer.fromJson<String>(json['routeId']),invoiceId: serializer.fromJson<String?>(json['invoiceId']),clientId: serializer.fromJson<String?>(json['clientId']),clientName: serializer.fromJson<String?>(json['clientName']),sequence: serializer.fromJson<int?>(json['sequence']),status: serializer.fromJson<String?>(json['status']),notes: serializer.fromJson<String?>(json['notes']),cashCollected: serializer.fromJson<double?>(json['cashCollected']),itemsDeliveredJson: serializer.fromJson<String?>(json['itemsDeliveredJson']),visitedAt: serializer.fromJson<DateTime?>(json['visitedAt']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'routeId': serializer.toJson<String>(routeId),'invoiceId': serializer.toJson<String?>(invoiceId),'clientId': serializer.toJson<String?>(clientId),'clientName': serializer.toJson<String?>(clientName),'sequence': serializer.toJson<int?>(sequence),'status': serializer.toJson<String?>(status),'notes': serializer.toJson<String?>(notes),'cashCollected': serializer.toJson<double?>(cashCollected),'itemsDeliveredJson': serializer.toJson<String?>(itemsDeliveredJson),'visitedAt': serializer.toJson<DateTime?>(visitedAt),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}RouteStop copyWith({String? id,String? tenantId,String? routeId,Value<String?> invoiceId = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<int?> sequence = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> notes = const Value.absent(),Value<double?> cashCollected = const Value.absent(),Value<String?> itemsDeliveredJson = const Value.absent(),Value<DateTime?> visitedAt = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => RouteStop(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,routeId: routeId ?? this.routeId,invoiceId: invoiceId.present ? invoiceId.value : this.invoiceId,clientId: clientId.present ? clientId.value : this.clientId,clientName: clientName.present ? clientName.value : this.clientName,sequence: sequence.present ? sequence.value : this.sequence,status: status.present ? status.value : this.status,notes: notes.present ? notes.value : this.notes,cashCollected: cashCollected.present ? cashCollected.value : this.cashCollected,itemsDeliveredJson: itemsDeliveredJson.present ? itemsDeliveredJson.value : this.itemsDeliveredJson,visitedAt: visitedAt.present ? visitedAt.value : this.visitedAt,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);RouteStop copyWithCompanion(RouteStopsCompanion data) {
return RouteStop(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,routeId: data.routeId.present ? data.routeId.value : this.routeId,invoiceId: data.invoiceId.present ? data.invoiceId.value : this.invoiceId,clientId: data.clientId.present ? data.clientId.value : this.clientId,clientName: data.clientName.present ? data.clientName.value : this.clientName,sequence: data.sequence.present ? data.sequence.value : this.sequence,status: data.status.present ? data.status.value : this.status,notes: data.notes.present ? data.notes.value : this.notes,cashCollected: data.cashCollected.present ? data.cashCollected.value : this.cashCollected,itemsDeliveredJson: data.itemsDeliveredJson.present ? data.itemsDeliveredJson.value : this.itemsDeliveredJson,visitedAt: data.visitedAt.present ? data.visitedAt.value : this.visitedAt,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('RouteStop(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('routeId: $routeId, ')..write('invoiceId: $invoiceId, ')..write('clientId: $clientId, ')..write('clientName: $clientName, ')..write('sequence: $sequence, ')..write('status: $status, ')..write('notes: $notes, ')..write('cashCollected: $cashCollected, ')..write('itemsDeliveredJson: $itemsDeliveredJson, ')..write('visitedAt: $visitedAt, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, routeId, invoiceId, clientId, clientName, sequence, status, notes, cashCollected, itemsDeliveredJson, visitedAt, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is RouteStop && other.id == this.id && other.tenantId == this.tenantId && other.routeId == this.routeId && other.invoiceId == this.invoiceId && other.clientId == this.clientId && other.clientName == this.clientName && other.sequence == this.sequence && other.status == this.status && other.notes == this.notes && other.cashCollected == this.cashCollected && other.itemsDeliveredJson == this.itemsDeliveredJson && other.visitedAt == this.visitedAt && other.updatedAt == this.updatedAt);
}class RouteStopsCompanion extends UpdateCompanion<RouteStop> {
final Value<String> id;
final Value<String> tenantId;
final Value<String> routeId;
final Value<String?> invoiceId;
final Value<String?> clientId;
final Value<String?> clientName;
final Value<int?> sequence;
final Value<String?> status;
final Value<String?> notes;
final Value<double?> cashCollected;
final Value<String?> itemsDeliveredJson;
final Value<DateTime?> visitedAt;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const RouteStopsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.routeId = const Value.absent(),this.invoiceId = const Value.absent(),this.clientId = const Value.absent(),this.clientName = const Value.absent(),this.sequence = const Value.absent(),this.status = const Value.absent(),this.notes = const Value.absent(),this.cashCollected = const Value.absent(),this.itemsDeliveredJson = const Value.absent(),this.visitedAt = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
RouteStopsCompanion.insert({required String id,required String tenantId,required String routeId,this.invoiceId = const Value.absent(),this.clientId = const Value.absent(),this.clientName = const Value.absent(),this.sequence = const Value.absent(),this.status = const Value.absent(),this.notes = const Value.absent(),this.cashCollected = const Value.absent(),this.itemsDeliveredJson = const Value.absent(),this.visitedAt = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId), routeId = Value(routeId);
static Insertable<RouteStop> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? routeId, 
Expression<String>? invoiceId, 
Expression<String>? clientId, 
Expression<String>? clientName, 
Expression<int>? sequence, 
Expression<String>? status, 
Expression<String>? notes, 
Expression<double>? cashCollected, 
Expression<String>? itemsDeliveredJson, 
Expression<DateTime>? visitedAt, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (routeId != null)'route_id': routeId,if (invoiceId != null)'invoice_id': invoiceId,if (clientId != null)'client_id': clientId,if (clientName != null)'client_name': clientName,if (sequence != null)'sequence': sequence,if (status != null)'status': status,if (notes != null)'notes': notes,if (cashCollected != null)'cash_collected': cashCollected,if (itemsDeliveredJson != null)'items_delivered_json': itemsDeliveredJson,if (visitedAt != null)'visited_at': visitedAt,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}RouteStopsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String>? routeId, Value<String?>? invoiceId, Value<String?>? clientId, Value<String?>? clientName, Value<int?>? sequence, Value<String?>? status, Value<String?>? notes, Value<double?>? cashCollected, Value<String?>? itemsDeliveredJson, Value<DateTime?>? visitedAt, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return RouteStopsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,routeId: routeId ?? this.routeId,invoiceId: invoiceId ?? this.invoiceId,clientId: clientId ?? this.clientId,clientName: clientName ?? this.clientName,sequence: sequence ?? this.sequence,status: status ?? this.status,notes: notes ?? this.notes,cashCollected: cashCollected ?? this.cashCollected,itemsDeliveredJson: itemsDeliveredJson ?? this.itemsDeliveredJson,visitedAt: visitedAt ?? this.visitedAt,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (routeId.present) {
map['route_id'] = Variable<String>(routeId.value);}
if (invoiceId.present) {
map['invoice_id'] = Variable<String>(invoiceId.value);}
if (clientId.present) {
map['client_id'] = Variable<String>(clientId.value);}
if (clientName.present) {
map['client_name'] = Variable<String>(clientName.value);}
if (sequence.present) {
map['sequence'] = Variable<int>(sequence.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (notes.present) {
map['notes'] = Variable<String>(notes.value);}
if (cashCollected.present) {
map['cash_collected'] = Variable<double>(cashCollected.value);}
if (itemsDeliveredJson.present) {
map['items_delivered_json'] = Variable<String>(itemsDeliveredJson.value);}
if (visitedAt.present) {
map['visited_at'] = Variable<DateTime>(visitedAt.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('RouteStopsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('routeId: $routeId, ')..write('invoiceId: $invoiceId, ')..write('clientId: $clientId, ')..write('clientName: $clientName, ')..write('sequence: $sequence, ')..write('status: $status, ')..write('notes: $notes, ')..write('cashCollected: $cashCollected, ')..write('itemsDeliveredJson: $itemsDeliveredJson, ')..write('visitedAt: $visitedAt, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $PurchaseReturnsTable extends PurchaseReturns with TableInfo<$PurchaseReturnsTable, PurchaseReturn>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$PurchaseReturnsTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _purchaseIdMeta = const VerificationMeta('purchaseId');
@override
late final GeneratedColumn<String> purchaseId = GeneratedColumn<String>('purchase_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _supplierIdMeta = const VerificationMeta('supplierId');
@override
late final GeneratedColumn<String> supplierId = GeneratedColumn<String>('supplier_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _supplierNameMeta = const VerificationMeta('supplierName');
@override
late final GeneratedColumn<String> supplierName = GeneratedColumn<String>('supplier_name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _productIdMeta = const VerificationMeta('productId');
@override
late final GeneratedColumn<String> productId = GeneratedColumn<String>('product_id', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _productNameMeta = const VerificationMeta('productName');
@override
late final GeneratedColumn<String> productName = GeneratedColumn<String>('product_name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _quantityMeta = const VerificationMeta('quantity');
@override
late final GeneratedColumn<double> quantity = GeneratedColumn<double>('quantity', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _unitPriceMeta = const VerificationMeta('unitPrice');
@override
late final GeneratedColumn<double> unitPrice = GeneratedColumn<double>('unit_price', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _totalAmountMeta = const VerificationMeta('totalAmount');
@override
late final GeneratedColumn<double> totalAmount = GeneratedColumn<double>('total_amount', aliasedName, true, type: DriftSqlType.double, requiredDuringInsert: false);
static const VerificationMeta _reasonMeta = const VerificationMeta('reason');
@override
late final GeneratedColumn<String> reason = GeneratedColumn<String>('reason', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _dateMeta = const VerificationMeta('date');
@override
late final GeneratedColumn<String> date = GeneratedColumn<String>('date', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, purchaseId, supplierId, supplierName, productId, productName, quantity, unitPrice, totalAmount, reason, date, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'purchase_returns';
@override
VerificationContext validateIntegrity(Insertable<PurchaseReturn> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('purchase_id')) {
context.handle(_purchaseIdMeta, purchaseId.isAcceptableOrUnknown(data['purchase_id']!, _purchaseIdMeta));}if (data.containsKey('supplier_id')) {
context.handle(_supplierIdMeta, supplierId.isAcceptableOrUnknown(data['supplier_id']!, _supplierIdMeta));}if (data.containsKey('supplier_name')) {
context.handle(_supplierNameMeta, supplierName.isAcceptableOrUnknown(data['supplier_name']!, _supplierNameMeta));}if (data.containsKey('product_id')) {
context.handle(_productIdMeta, productId.isAcceptableOrUnknown(data['product_id']!, _productIdMeta));}if (data.containsKey('product_name')) {
context.handle(_productNameMeta, productName.isAcceptableOrUnknown(data['product_name']!, _productNameMeta));}if (data.containsKey('quantity')) {
context.handle(_quantityMeta, quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta));}if (data.containsKey('unit_price')) {
context.handle(_unitPriceMeta, unitPrice.isAcceptableOrUnknown(data['unit_price']!, _unitPriceMeta));}if (data.containsKey('total_amount')) {
context.handle(_totalAmountMeta, totalAmount.isAcceptableOrUnknown(data['total_amount']!, _totalAmountMeta));}if (data.containsKey('reason')) {
context.handle(_reasonMeta, reason.isAcceptableOrUnknown(data['reason']!, _reasonMeta));}if (data.containsKey('date')) {
context.handle(_dateMeta, date.isAcceptableOrUnknown(data['date']!, _dateMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override PurchaseReturn map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return PurchaseReturn(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, purchaseId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}purchase_id']), supplierId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}supplier_id']), supplierName: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}supplier_name']), productId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}product_id']), productName: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}product_name']), quantity: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}quantity']), unitPrice: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}unit_price']), totalAmount: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}total_amount']), reason: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}reason']), date: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}date']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$PurchaseReturnsTable createAlias(String alias) {
return $PurchaseReturnsTable(attachedDatabase, alias);}}class PurchaseReturn extends DataClass implements Insertable<PurchaseReturn> 
{
final String id;
final String tenantId;
final String? purchaseId;
final String? supplierId;
final String? supplierName;
final String? productId;
final String? productName;
final double? quantity;
final double? unitPrice;
final double? totalAmount;
final String? reason;
final String? date;
final DateTime? updatedAt;
const PurchaseReturn({required this.id, required this.tenantId, this.purchaseId, this.supplierId, this.supplierName, this.productId, this.productName, this.quantity, this.unitPrice, this.totalAmount, this.reason, this.date, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || purchaseId != null){map['purchase_id'] = Variable<String>(purchaseId);
}if (!nullToAbsent || supplierId != null){map['supplier_id'] = Variable<String>(supplierId);
}if (!nullToAbsent || supplierName != null){map['supplier_name'] = Variable<String>(supplierName);
}if (!nullToAbsent || productId != null){map['product_id'] = Variable<String>(productId);
}if (!nullToAbsent || productName != null){map['product_name'] = Variable<String>(productName);
}if (!nullToAbsent || quantity != null){map['quantity'] = Variable<double>(quantity);
}if (!nullToAbsent || unitPrice != null){map['unit_price'] = Variable<double>(unitPrice);
}if (!nullToAbsent || totalAmount != null){map['total_amount'] = Variable<double>(totalAmount);
}if (!nullToAbsent || reason != null){map['reason'] = Variable<String>(reason);
}if (!nullToAbsent || date != null){map['date'] = Variable<String>(date);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
PurchaseReturnsCompanion toCompanion(bool nullToAbsent) {
return PurchaseReturnsCompanion(id: Value(id),tenantId: Value(tenantId),purchaseId: purchaseId == null && nullToAbsent ? const Value.absent() : Value(purchaseId),supplierId: supplierId == null && nullToAbsent ? const Value.absent() : Value(supplierId),supplierName: supplierName == null && nullToAbsent ? const Value.absent() : Value(supplierName),productId: productId == null && nullToAbsent ? const Value.absent() : Value(productId),productName: productName == null && nullToAbsent ? const Value.absent() : Value(productName),quantity: quantity == null && nullToAbsent ? const Value.absent() : Value(quantity),unitPrice: unitPrice == null && nullToAbsent ? const Value.absent() : Value(unitPrice),totalAmount: totalAmount == null && nullToAbsent ? const Value.absent() : Value(totalAmount),reason: reason == null && nullToAbsent ? const Value.absent() : Value(reason),date: date == null && nullToAbsent ? const Value.absent() : Value(date),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory PurchaseReturn.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return PurchaseReturn(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),purchaseId: serializer.fromJson<String?>(json['purchaseId']),supplierId: serializer.fromJson<String?>(json['supplierId']),supplierName: serializer.fromJson<String?>(json['supplierName']),productId: serializer.fromJson<String?>(json['productId']),productName: serializer.fromJson<String?>(json['productName']),quantity: serializer.fromJson<double?>(json['quantity']),unitPrice: serializer.fromJson<double?>(json['unitPrice']),totalAmount: serializer.fromJson<double?>(json['totalAmount']),reason: serializer.fromJson<String?>(json['reason']),date: serializer.fromJson<String?>(json['date']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'purchaseId': serializer.toJson<String?>(purchaseId),'supplierId': serializer.toJson<String?>(supplierId),'supplierName': serializer.toJson<String?>(supplierName),'productId': serializer.toJson<String?>(productId),'productName': serializer.toJson<String?>(productName),'quantity': serializer.toJson<double?>(quantity),'unitPrice': serializer.toJson<double?>(unitPrice),'totalAmount': serializer.toJson<double?>(totalAmount),'reason': serializer.toJson<String?>(reason),'date': serializer.toJson<String?>(date),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}PurchaseReturn copyWith({String? id,String? tenantId,Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> supplierName = const Value.absent(),Value<String?> productId = const Value.absent(),Value<String?> productName = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<double?> unitPrice = const Value.absent(),Value<double?> totalAmount = const Value.absent(),Value<String?> reason = const Value.absent(),Value<String?> date = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => PurchaseReturn(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,purchaseId: purchaseId.present ? purchaseId.value : this.purchaseId,supplierId: supplierId.present ? supplierId.value : this.supplierId,supplierName: supplierName.present ? supplierName.value : this.supplierName,productId: productId.present ? productId.value : this.productId,productName: productName.present ? productName.value : this.productName,quantity: quantity.present ? quantity.value : this.quantity,unitPrice: unitPrice.present ? unitPrice.value : this.unitPrice,totalAmount: totalAmount.present ? totalAmount.value : this.totalAmount,reason: reason.present ? reason.value : this.reason,date: date.present ? date.value : this.date,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);PurchaseReturn copyWithCompanion(PurchaseReturnsCompanion data) {
return PurchaseReturn(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,purchaseId: data.purchaseId.present ? data.purchaseId.value : this.purchaseId,supplierId: data.supplierId.present ? data.supplierId.value : this.supplierId,supplierName: data.supplierName.present ? data.supplierName.value : this.supplierName,productId: data.productId.present ? data.productId.value : this.productId,productName: data.productName.present ? data.productName.value : this.productName,quantity: data.quantity.present ? data.quantity.value : this.quantity,unitPrice: data.unitPrice.present ? data.unitPrice.value : this.unitPrice,totalAmount: data.totalAmount.present ? data.totalAmount.value : this.totalAmount,reason: data.reason.present ? data.reason.value : this.reason,date: data.date.present ? data.date.value : this.date,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('PurchaseReturn(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('purchaseId: $purchaseId, ')..write('supplierId: $supplierId, ')..write('supplierName: $supplierName, ')..write('productId: $productId, ')..write('productName: $productName, ')..write('quantity: $quantity, ')..write('unitPrice: $unitPrice, ')..write('totalAmount: $totalAmount, ')..write('reason: $reason, ')..write('date: $date, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, purchaseId, supplierId, supplierName, productId, productName, quantity, unitPrice, totalAmount, reason, date, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is PurchaseReturn && other.id == this.id && other.tenantId == this.tenantId && other.purchaseId == this.purchaseId && other.supplierId == this.supplierId && other.supplierName == this.supplierName && other.productId == this.productId && other.productName == this.productName && other.quantity == this.quantity && other.unitPrice == this.unitPrice && other.totalAmount == this.totalAmount && other.reason == this.reason && other.date == this.date && other.updatedAt == this.updatedAt);
}class PurchaseReturnsCompanion extends UpdateCompanion<PurchaseReturn> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> purchaseId;
final Value<String?> supplierId;
final Value<String?> supplierName;
final Value<String?> productId;
final Value<String?> productName;
final Value<double?> quantity;
final Value<double?> unitPrice;
final Value<double?> totalAmount;
final Value<String?> reason;
final Value<String?> date;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const PurchaseReturnsCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.purchaseId = const Value.absent(),this.supplierId = const Value.absent(),this.supplierName = const Value.absent(),this.productId = const Value.absent(),this.productName = const Value.absent(),this.quantity = const Value.absent(),this.unitPrice = const Value.absent(),this.totalAmount = const Value.absent(),this.reason = const Value.absent(),this.date = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
PurchaseReturnsCompanion.insert({required String id,required String tenantId,this.purchaseId = const Value.absent(),this.supplierId = const Value.absent(),this.supplierName = const Value.absent(),this.productId = const Value.absent(),this.productName = const Value.absent(),this.quantity = const Value.absent(),this.unitPrice = const Value.absent(),this.totalAmount = const Value.absent(),this.reason = const Value.absent(),this.date = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<PurchaseReturn> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? purchaseId, 
Expression<String>? supplierId, 
Expression<String>? supplierName, 
Expression<String>? productId, 
Expression<String>? productName, 
Expression<double>? quantity, 
Expression<double>? unitPrice, 
Expression<double>? totalAmount, 
Expression<String>? reason, 
Expression<String>? date, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (purchaseId != null)'purchase_id': purchaseId,if (supplierId != null)'supplier_id': supplierId,if (supplierName != null)'supplier_name': supplierName,if (productId != null)'product_id': productId,if (productName != null)'product_name': productName,if (quantity != null)'quantity': quantity,if (unitPrice != null)'unit_price': unitPrice,if (totalAmount != null)'total_amount': totalAmount,if (reason != null)'reason': reason,if (date != null)'date': date,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}PurchaseReturnsCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? purchaseId, Value<String?>? supplierId, Value<String?>? supplierName, Value<String?>? productId, Value<String?>? productName, Value<double?>? quantity, Value<double?>? unitPrice, Value<double?>? totalAmount, Value<String?>? reason, Value<String?>? date, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return PurchaseReturnsCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,purchaseId: purchaseId ?? this.purchaseId,supplierId: supplierId ?? this.supplierId,supplierName: supplierName ?? this.supplierName,productId: productId ?? this.productId,productName: productName ?? this.productName,quantity: quantity ?? this.quantity,unitPrice: unitPrice ?? this.unitPrice,totalAmount: totalAmount ?? this.totalAmount,reason: reason ?? this.reason,date: date ?? this.date,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (purchaseId.present) {
map['purchase_id'] = Variable<String>(purchaseId.value);}
if (supplierId.present) {
map['supplier_id'] = Variable<String>(supplierId.value);}
if (supplierName.present) {
map['supplier_name'] = Variable<String>(supplierName.value);}
if (productId.present) {
map['product_id'] = Variable<String>(productId.value);}
if (productName.present) {
map['product_name'] = Variable<String>(productName.value);}
if (quantity.present) {
map['quantity'] = Variable<double>(quantity.value);}
if (unitPrice.present) {
map['unit_price'] = Variable<double>(unitPrice.value);}
if (totalAmount.present) {
map['total_amount'] = Variable<double>(totalAmount.value);}
if (reason.present) {
map['reason'] = Variable<String>(reason.value);}
if (date.present) {
map['date'] = Variable<String>(date.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('PurchaseReturnsCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('purchaseId: $purchaseId, ')..write('supplierId: $supplierId, ')..write('supplierName: $supplierName, ')..write('productId: $productId, ')..write('productName: $productName, ')..write('quantity: $quantity, ')..write('unitPrice: $unitPrice, ')..write('totalAmount: $totalAmount, ')..write('reason: $reason, ')..write('date: $date, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
class $UsersLocalTable extends UsersLocal with TableInfo<$UsersLocalTable, UsersLocalData>{
@override final GeneratedDatabase attachedDatabase;
final String? _alias;
$UsersLocalTable(this.attachedDatabase, [this._alias]);
static const VerificationMeta _idMeta = const VerificationMeta('id');
@override
late final GeneratedColumn<String> id = GeneratedColumn<String>('id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _tenantIdMeta = const VerificationMeta('tenantId');
@override
late final GeneratedColumn<String> tenantId = GeneratedColumn<String>('tenant_id', aliasedName, false, type: DriftSqlType.string, requiredDuringInsert: true);
static const VerificationMeta _nameMeta = const VerificationMeta('name');
@override
late final GeneratedColumn<String> name = GeneratedColumn<String>('name', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _emailMeta = const VerificationMeta('email');
@override
late final GeneratedColumn<String> email = GeneratedColumn<String>('email', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _statusMeta = const VerificationMeta('status');
@override
late final GeneratedColumn<String> status = GeneratedColumn<String>('status', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _avatarUrlMeta = const VerificationMeta('avatarUrl');
@override
late final GeneratedColumn<String> avatarUrl = GeneratedColumn<String>('avatar_url', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _rolesJsonMeta = const VerificationMeta('rolesJson');
@override
late final GeneratedColumn<String> rolesJson = GeneratedColumn<String>('roles_json', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _permissionsJsonMeta = const VerificationMeta('permissionsJson');
@override
late final GeneratedColumn<String> permissionsJson = GeneratedColumn<String>('permissions_json', aliasedName, true, type: DriftSqlType.string, requiredDuringInsert: false);
static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
@override
late final GeneratedColumn<DateTime> updatedAt = GeneratedColumn<DateTime>('updated_at', aliasedName, true, type: DriftSqlType.dateTime, requiredDuringInsert: false);
@override
List<GeneratedColumn> get $columns => [id, tenantId, name, email, status, avatarUrl, rolesJson, permissionsJson, updatedAt];
@override
String get aliasedName => _alias ?? actualTableName;
@override
 String get actualTableName => $name;
static const String $name = 'users_local';
@override
VerificationContext validateIntegrity(Insertable<UsersLocalData> instance, {bool isInserting = false}) {
final context = VerificationContext();
final data = instance.toColumns(true);
if (data.containsKey('id')) {
context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));} else if (isInserting) {
context.missing(_idMeta);
}
if (data.containsKey('tenant_id')) {
context.handle(_tenantIdMeta, tenantId.isAcceptableOrUnknown(data['tenant_id']!, _tenantIdMeta));} else if (isInserting) {
context.missing(_tenantIdMeta);
}
if (data.containsKey('name')) {
context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));}if (data.containsKey('email')) {
context.handle(_emailMeta, email.isAcceptableOrUnknown(data['email']!, _emailMeta));}if (data.containsKey('status')) {
context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));}if (data.containsKey('avatar_url')) {
context.handle(_avatarUrlMeta, avatarUrl.isAcceptableOrUnknown(data['avatar_url']!, _avatarUrlMeta));}if (data.containsKey('roles_json')) {
context.handle(_rolesJsonMeta, rolesJson.isAcceptableOrUnknown(data['roles_json']!, _rolesJsonMeta));}if (data.containsKey('permissions_json')) {
context.handle(_permissionsJsonMeta, permissionsJson.isAcceptableOrUnknown(data['permissions_json']!, _permissionsJsonMeta));}if (data.containsKey('updated_at')) {
context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));}return context;
}
@override
Set<GeneratedColumn> get $primaryKey => {id};
@override UsersLocalData map(Map<String, dynamic> data, {String? tablePrefix})  {
final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';return UsersLocalData(id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!, tenantId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}tenant_id'])!, name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name']), email: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}email']), status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status']), avatarUrl: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}avatar_url']), rolesJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}roles_json']), permissionsJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}permissions_json']), updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.dateTime, data['${effectivePrefix}updated_at']), );
}
@override
$UsersLocalTable createAlias(String alias) {
return $UsersLocalTable(attachedDatabase, alias);}}class UsersLocalData extends DataClass implements Insertable<UsersLocalData> 
{
final String id;
final String tenantId;
final String? name;
final String? email;
final String? status;
final String? avatarUrl;
final String? rolesJson;
final String? permissionsJson;
final DateTime? updatedAt;
const UsersLocalData({required this.id, required this.tenantId, this.name, this.email, this.status, this.avatarUrl, this.rolesJson, this.permissionsJson, this.updatedAt});@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};map['id'] = Variable<String>(id);
map['tenant_id'] = Variable<String>(tenantId);
if (!nullToAbsent || name != null){map['name'] = Variable<String>(name);
}if (!nullToAbsent || email != null){map['email'] = Variable<String>(email);
}if (!nullToAbsent || status != null){map['status'] = Variable<String>(status);
}if (!nullToAbsent || avatarUrl != null){map['avatar_url'] = Variable<String>(avatarUrl);
}if (!nullToAbsent || rolesJson != null){map['roles_json'] = Variable<String>(rolesJson);
}if (!nullToAbsent || permissionsJson != null){map['permissions_json'] = Variable<String>(permissionsJson);
}if (!nullToAbsent || updatedAt != null){map['updated_at'] = Variable<DateTime>(updatedAt);
}return map; 
}
UsersLocalCompanion toCompanion(bool nullToAbsent) {
return UsersLocalCompanion(id: Value(id),tenantId: Value(tenantId),name: name == null && nullToAbsent ? const Value.absent() : Value(name),email: email == null && nullToAbsent ? const Value.absent() : Value(email),status: status == null && nullToAbsent ? const Value.absent() : Value(status),avatarUrl: avatarUrl == null && nullToAbsent ? const Value.absent() : Value(avatarUrl),rolesJson: rolesJson == null && nullToAbsent ? const Value.absent() : Value(rolesJson),permissionsJson: permissionsJson == null && nullToAbsent ? const Value.absent() : Value(permissionsJson),updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),);
}
factory UsersLocalData.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return UsersLocalData(id: serializer.fromJson<String>(json['id']),tenantId: serializer.fromJson<String>(json['tenantId']),name: serializer.fromJson<String?>(json['name']),email: serializer.fromJson<String?>(json['email']),status: serializer.fromJson<String?>(json['status']),avatarUrl: serializer.fromJson<String?>(json['avatarUrl']),rolesJson: serializer.fromJson<String?>(json['rolesJson']),permissionsJson: serializer.fromJson<String?>(json['permissionsJson']),updatedAt: serializer.fromJson<DateTime?>(json['updatedAt']),);}
@override Map<String, dynamic> toJson({ValueSerializer? serializer}) {
serializer ??= driftRuntimeOptions.defaultSerializer;
return <String, dynamic>{
'id': serializer.toJson<String>(id),'tenantId': serializer.toJson<String>(tenantId),'name': serializer.toJson<String?>(name),'email': serializer.toJson<String?>(email),'status': serializer.toJson<String?>(status),'avatarUrl': serializer.toJson<String?>(avatarUrl),'rolesJson': serializer.toJson<String?>(rolesJson),'permissionsJson': serializer.toJson<String?>(permissionsJson),'updatedAt': serializer.toJson<DateTime?>(updatedAt),};}UsersLocalData copyWith({String? id,String? tenantId,Value<String?> name = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> avatarUrl = const Value.absent(),Value<String?> rolesJson = const Value.absent(),Value<String?> permissionsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent()}) => UsersLocalData(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name.present ? name.value : this.name,email: email.present ? email.value : this.email,status: status.present ? status.value : this.status,avatarUrl: avatarUrl.present ? avatarUrl.value : this.avatarUrl,rolesJson: rolesJson.present ? rolesJson.value : this.rolesJson,permissionsJson: permissionsJson.present ? permissionsJson.value : this.permissionsJson,updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,);UsersLocalData copyWithCompanion(UsersLocalCompanion data) {
return UsersLocalData(
id: data.id.present ? data.id.value : this.id,tenantId: data.tenantId.present ? data.tenantId.value : this.tenantId,name: data.name.present ? data.name.value : this.name,email: data.email.present ? data.email.value : this.email,status: data.status.present ? data.status.value : this.status,avatarUrl: data.avatarUrl.present ? data.avatarUrl.value : this.avatarUrl,rolesJson: data.rolesJson.present ? data.rolesJson.value : this.rolesJson,permissionsJson: data.permissionsJson.present ? data.permissionsJson.value : this.permissionsJson,updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,);
}
@override
String toString() {return (StringBuffer('UsersLocalData(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('email: $email, ')..write('status: $status, ')..write('avatarUrl: $avatarUrl, ')..write('rolesJson: $rolesJson, ')..write('permissionsJson: $permissionsJson, ')..write('updatedAt: $updatedAt')..write(')')).toString();}
@override
 int get hashCode => Object.hash(id, tenantId, name, email, status, avatarUrl, rolesJson, permissionsJson, updatedAt);@override
bool operator ==(Object other) => identical(this, other) || (other is UsersLocalData && other.id == this.id && other.tenantId == this.tenantId && other.name == this.name && other.email == this.email && other.status == this.status && other.avatarUrl == this.avatarUrl && other.rolesJson == this.rolesJson && other.permissionsJson == this.permissionsJson && other.updatedAt == this.updatedAt);
}class UsersLocalCompanion extends UpdateCompanion<UsersLocalData> {
final Value<String> id;
final Value<String> tenantId;
final Value<String?> name;
final Value<String?> email;
final Value<String?> status;
final Value<String?> avatarUrl;
final Value<String?> rolesJson;
final Value<String?> permissionsJson;
final Value<DateTime?> updatedAt;
final Value<int> rowid;
const UsersLocalCompanion({this.id = const Value.absent(),this.tenantId = const Value.absent(),this.name = const Value.absent(),this.email = const Value.absent(),this.status = const Value.absent(),this.avatarUrl = const Value.absent(),this.rolesJson = const Value.absent(),this.permissionsJson = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),});
UsersLocalCompanion.insert({required String id,required String tenantId,this.name = const Value.absent(),this.email = const Value.absent(),this.status = const Value.absent(),this.avatarUrl = const Value.absent(),this.rolesJson = const Value.absent(),this.permissionsJson = const Value.absent(),this.updatedAt = const Value.absent(),this.rowid = const Value.absent(),}): id = Value(id), tenantId = Value(tenantId);
static Insertable<UsersLocalData> custom({Expression<String>? id, 
Expression<String>? tenantId, 
Expression<String>? name, 
Expression<String>? email, 
Expression<String>? status, 
Expression<String>? avatarUrl, 
Expression<String>? rolesJson, 
Expression<String>? permissionsJson, 
Expression<DateTime>? updatedAt, 
Expression<int>? rowid, 
}) {
return RawValuesInsertable({if (id != null)'id': id,if (tenantId != null)'tenant_id': tenantId,if (name != null)'name': name,if (email != null)'email': email,if (status != null)'status': status,if (avatarUrl != null)'avatar_url': avatarUrl,if (rolesJson != null)'roles_json': rolesJson,if (permissionsJson != null)'permissions_json': permissionsJson,if (updatedAt != null)'updated_at': updatedAt,if (rowid != null)'rowid': rowid,});
}UsersLocalCompanion copyWith({Value<String>? id, Value<String>? tenantId, Value<String?>? name, Value<String?>? email, Value<String?>? status, Value<String?>? avatarUrl, Value<String?>? rolesJson, Value<String?>? permissionsJson, Value<DateTime?>? updatedAt, Value<int>? rowid}) {
return UsersLocalCompanion(id: id ?? this.id,tenantId: tenantId ?? this.tenantId,name: name ?? this.name,email: email ?? this.email,status: status ?? this.status,avatarUrl: avatarUrl ?? this.avatarUrl,rolesJson: rolesJson ?? this.rolesJson,permissionsJson: permissionsJson ?? this.permissionsJson,updatedAt: updatedAt ?? this.updatedAt,rowid: rowid ?? this.rowid,);
}
@override
Map<String, Expression> toColumns(bool nullToAbsent) {
final map = <String, Expression> {};if (id.present) {
map['id'] = Variable<String>(id.value);}
if (tenantId.present) {
map['tenant_id'] = Variable<String>(tenantId.value);}
if (name.present) {
map['name'] = Variable<String>(name.value);}
if (email.present) {
map['email'] = Variable<String>(email.value);}
if (status.present) {
map['status'] = Variable<String>(status.value);}
if (avatarUrl.present) {
map['avatar_url'] = Variable<String>(avatarUrl.value);}
if (rolesJson.present) {
map['roles_json'] = Variable<String>(rolesJson.value);}
if (permissionsJson.present) {
map['permissions_json'] = Variable<String>(permissionsJson.value);}
if (updatedAt.present) {
map['updated_at'] = Variable<DateTime>(updatedAt.value);}
if (rowid.present) {
map['rowid'] = Variable<int>(rowid.value);}
return map; 
}
@override
String toString() {return (StringBuffer('UsersLocalCompanion(')..write('id: $id, ')..write('tenantId: $tenantId, ')..write('name: $name, ')..write('email: $email, ')..write('status: $status, ')..write('avatarUrl: $avatarUrl, ')..write('rolesJson: $rolesJson, ')..write('permissionsJson: $permissionsJson, ')..write('updatedAt: $updatedAt, ')..write('rowid: $rowid')..write(')')).toString();}
}
abstract class _$AppDatabase extends GeneratedDatabase{
_$AppDatabase(QueryExecutor e): super(e);
$AppDatabaseManager get managers => $AppDatabaseManager(this);
late final $SyncMutationsTable syncMutations = $SyncMutationsTable(this);
late final $TenantsTable tenants = $TenantsTable(this);
late final $ProductsTable products = $ProductsTable(this);
late final $ClientsTable clients = $ClientsTable(this);
late final $SalesTable sales = $SalesTable(this);
late final $ExpensesTable expenses = $ExpensesTable(this);
late final $SuppliersTable suppliers = $SuppliersTable(this);
late final $PurchasesTable purchases = $PurchasesTable(this);
late final $InvoicesTable invoices = $InvoicesTable(this);
late final $BusinessProfileLocalTable businessProfileLocal = $BusinessProfileLocalTable(this);
late final $RoutesTable routes = $RoutesTable(this);
late final $DayBookLocalTable dayBookLocal = $DayBookLocalTable(this);
late final $ClientPaymentsTable clientPayments = $ClientPaymentsTable(this);
late final $EmployeesTable employees = $EmployeesTable(this);
late final $InventoryLocationsTable inventoryLocations = $InventoryLocationsTable(this);
late final $InventoryBalancesTable inventoryBalances = $InventoryBalancesTable(this);
late final $ProductBatchesTable productBatches = $ProductBatchesTable(this);
late final $VehiclesTable vehicles = $VehiclesTable(this);
late final $RouteStopsTable routeStops = $RouteStopsTable(this);
late final $PurchaseReturnsTable purchaseReturns = $PurchaseReturnsTable(this);
late final $UsersLocalTable usersLocal = $UsersLocalTable(this);
@override
Iterable<TableInfo<Table, Object?>> get allTables => allSchemaEntities.whereType<TableInfo<Table, Object?>>();
@override
List<DatabaseSchemaEntity> get allSchemaEntities => [syncMutations, tenants, products, clients, sales, expenses, suppliers, purchases, invoices, businessProfileLocal, routes, dayBookLocal, clientPayments, employees, inventoryLocations, inventoryBalances, productBatches, vehicles, routeStops, purchaseReturns, usersLocal];
}
typedef $$SyncMutationsTableCreateCompanionBuilder = SyncMutationsCompanion Function({Value<int> id,required String targetTable,required String action,required String payload,Value<String?> rpcName,Value<DateTime> createdAt,Value<bool> isSynced,Value<String> status,Value<int> attempts,Value<String?> lastError,Value<DateTime> nextAttemptAt,Value<DateTime?> lastAttemptAt,});
typedef $$SyncMutationsTableUpdateCompanionBuilder = SyncMutationsCompanion Function({Value<int> id,Value<String> targetTable,Value<String> action,Value<String> payload,Value<String?> rpcName,Value<DateTime> createdAt,Value<bool> isSynced,Value<String> status,Value<int> attempts,Value<String?> lastError,Value<DateTime> nextAttemptAt,Value<DateTime?> lastAttemptAt,});
class $$SyncMutationsTableFilterComposer extends Composer<
        _$AppDatabase,
        $SyncMutationsTable> {
        $$SyncMutationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<int> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get targetTable => $composableBuilder(
      column: $table.targetTable,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get action => $composableBuilder(
      column: $table.action,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get payload => $composableBuilder(
      column: $table.payload,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get rpcName => $composableBuilder(
      column: $table.rpcName,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<bool> get isSynced => $composableBuilder(
      column: $table.isSynced,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<int> get attempts => $composableBuilder(
      column: $table.attempts,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get lastError => $composableBuilder(
      column: $table.lastError,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get nextAttemptAt => $composableBuilder(
      column: $table.nextAttemptAt,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$SyncMutationsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $SyncMutationsTable> {
        $$SyncMutationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<int> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get targetTable => $composableBuilder(
      column: $table.targetTable,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get action => $composableBuilder(
      column: $table.action,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get payload => $composableBuilder(
      column: $table.payload,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get rpcName => $composableBuilder(
      column: $table.rpcName,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<bool> get isSynced => $composableBuilder(
      column: $table.isSynced,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<int> get attempts => $composableBuilder(
      column: $table.attempts,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get lastError => $composableBuilder(
      column: $table.lastError,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get nextAttemptAt => $composableBuilder(
      column: $table.nextAttemptAt,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$SyncMutationsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $SyncMutationsTable> {
        $$SyncMutationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<int> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get targetTable => $composableBuilder(
      column: $table.targetTable,
      builder: (column) => column);
      
GeneratedColumn<String> get action => $composableBuilder(
      column: $table.action,
      builder: (column) => column);
      
GeneratedColumn<String> get payload => $composableBuilder(
      column: $table.payload,
      builder: (column) => column);
      
GeneratedColumn<String> get rpcName => $composableBuilder(
      column: $table.rpcName,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => column);
      
GeneratedColumn<bool> get isSynced => $composableBuilder(
      column: $table.isSynced,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<int> get attempts => $composableBuilder(
      column: $table.attempts,
      builder: (column) => column);
      
GeneratedColumn<String> get lastError => $composableBuilder(
      column: $table.lastError,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get nextAttemptAt => $composableBuilder(
      column: $table.nextAttemptAt,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get lastAttemptAt => $composableBuilder(
      column: $table.lastAttemptAt,
      builder: (column) => column);
      
        }
      class $$SyncMutationsTableTableManager extends RootTableManager    <_$AppDatabase,
    $SyncMutationsTable,
    SyncMutation,
    $$SyncMutationsTableFilterComposer,
    $$SyncMutationsTableOrderingComposer,
    $$SyncMutationsTableAnnotationComposer,
    $$SyncMutationsTableCreateCompanionBuilder,
    $$SyncMutationsTableUpdateCompanionBuilder,
    (SyncMutation,BaseReferences<_$AppDatabase,$SyncMutationsTable,SyncMutation>),
    SyncMutation,
    PrefetchHooks Function()
    > {
    $$SyncMutationsTableTableManager(_$AppDatabase db, $SyncMutationsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$SyncMutationsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$SyncMutationsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$SyncMutationsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<int> id = const Value.absent(),Value<String> targetTable = const Value.absent(),Value<String> action = const Value.absent(),Value<String> payload = const Value.absent(),Value<String?> rpcName = const Value.absent(),Value<DateTime> createdAt = const Value.absent(),Value<bool> isSynced = const Value.absent(),Value<String> status = const Value.absent(),Value<int> attempts = const Value.absent(),Value<String?> lastError = const Value.absent(),Value<DateTime> nextAttemptAt = const Value.absent(),Value<DateTime?> lastAttemptAt = const Value.absent(),})=> SyncMutationsCompanion(id: id,targetTable: targetTable,action: action,payload: payload,rpcName: rpcName,createdAt: createdAt,isSynced: isSynced,status: status,attempts: attempts,lastError: lastError,nextAttemptAt: nextAttemptAt,lastAttemptAt: lastAttemptAt,),
        createCompanionCallback: ({Value<int> id = const Value.absent(),required String targetTable,required String action,required String payload,Value<String?> rpcName = const Value.absent(),Value<DateTime> createdAt = const Value.absent(),Value<bool> isSynced = const Value.absent(),Value<String> status = const Value.absent(),Value<int> attempts = const Value.absent(),Value<String?> lastError = const Value.absent(),Value<DateTime> nextAttemptAt = const Value.absent(),Value<DateTime?> lastAttemptAt = const Value.absent(),})=> SyncMutationsCompanion.insert(id: id,targetTable: targetTable,action: action,payload: payload,rpcName: rpcName,createdAt: createdAt,isSynced: isSynced,status: status,attempts: attempts,lastError: lastError,nextAttemptAt: nextAttemptAt,lastAttemptAt: lastAttemptAt,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$SyncMutationsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $SyncMutationsTable,
    SyncMutation,
    $$SyncMutationsTableFilterComposer,
    $$SyncMutationsTableOrderingComposer,
    $$SyncMutationsTableAnnotationComposer,
    $$SyncMutationsTableCreateCompanionBuilder,
    $$SyncMutationsTableUpdateCompanionBuilder,
    (SyncMutation,BaseReferences<_$AppDatabase,$SyncMutationsTable,SyncMutation>),
    SyncMutation,
    PrefetchHooks Function()
    >;typedef $$TenantsTableCreateCompanionBuilder = TenantsCompanion Function({required String id,required String name,required String slug,required String plan,required String status,required DateTime createdAt,Value<int> rowid,});
typedef $$TenantsTableUpdateCompanionBuilder = TenantsCompanion Function({Value<String> id,Value<String> name,Value<String> slug,Value<String> plan,Value<String> status,Value<DateTime> createdAt,Value<int> rowid,});
class $$TenantsTableFilterComposer extends Composer<
        _$AppDatabase,
        $TenantsTable> {
        $$TenantsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get slug => $composableBuilder(
      column: $table.slug,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get plan => $composableBuilder(
      column: $table.plan,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$TenantsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $TenantsTable> {
        $$TenantsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get slug => $composableBuilder(
      column: $table.slug,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get plan => $composableBuilder(
      column: $table.plan,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$TenantsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $TenantsTable> {
        $$TenantsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get slug => $composableBuilder(
      column: $table.slug,
      builder: (column) => column);
      
GeneratedColumn<String> get plan => $composableBuilder(
      column: $table.plan,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get createdAt => $composableBuilder(
      column: $table.createdAt,
      builder: (column) => column);
      
        }
      class $$TenantsTableTableManager extends RootTableManager    <_$AppDatabase,
    $TenantsTable,
    Tenant,
    $$TenantsTableFilterComposer,
    $$TenantsTableOrderingComposer,
    $$TenantsTableAnnotationComposer,
    $$TenantsTableCreateCompanionBuilder,
    $$TenantsTableUpdateCompanionBuilder,
    (Tenant,BaseReferences<_$AppDatabase,$TenantsTable,Tenant>),
    Tenant,
    PrefetchHooks Function()
    > {
    $$TenantsTableTableManager(_$AppDatabase db, $TenantsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$TenantsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$TenantsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$TenantsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> name = const Value.absent(),Value<String> slug = const Value.absent(),Value<String> plan = const Value.absent(),Value<String> status = const Value.absent(),Value<DateTime> createdAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> TenantsCompanion(id: id,name: name,slug: slug,plan: plan,status: status,createdAt: createdAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String name,required String slug,required String plan,required String status,required DateTime createdAt,Value<int> rowid = const Value.absent(),})=> TenantsCompanion.insert(id: id,name: name,slug: slug,plan: plan,status: status,createdAt: createdAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$TenantsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $TenantsTable,
    Tenant,
    $$TenantsTableFilterComposer,
    $$TenantsTableOrderingComposer,
    $$TenantsTableAnnotationComposer,
    $$TenantsTableCreateCompanionBuilder,
    $$TenantsTableUpdateCompanionBuilder,
    (Tenant,BaseReferences<_$AppDatabase,$TenantsTable,Tenant>),
    Tenant,
    PrefetchHooks Function()
    >;typedef $$ProductsTableCreateCompanionBuilder = ProductsCompanion Function({required String id,required String tenantId,Value<String?> sku,required String name,Value<String?> category,Value<String?> unit,Value<String?> secondaryUnit,Value<double?> conversionFactor,Value<double> costPrice,Value<double> sellingPrice,Value<double> stock,Value<double> taxRate,Value<double> cessRate,Value<String?> hsnCode,Value<String?> image,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$ProductsTableUpdateCompanionBuilder = ProductsCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> sku,Value<String> name,Value<String?> category,Value<String?> unit,Value<String?> secondaryUnit,Value<double?> conversionFactor,Value<double> costPrice,Value<double> sellingPrice,Value<double> stock,Value<double> taxRate,Value<double> cessRate,Value<String?> hsnCode,Value<String?> image,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$ProductsTableFilterComposer extends Composer<
        _$AppDatabase,
        $ProductsTable> {
        $$ProductsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get sku => $composableBuilder(
      column: $table.sku,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get unit => $composableBuilder(
      column: $table.unit,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get secondaryUnit => $composableBuilder(
      column: $table.secondaryUnit,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get conversionFactor => $composableBuilder(
      column: $table.conversionFactor,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get costPrice => $composableBuilder(
      column: $table.costPrice,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get sellingPrice => $composableBuilder(
      column: $table.sellingPrice,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get stock => $composableBuilder(
      column: $table.stock,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get taxRate => $composableBuilder(
      column: $table.taxRate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get cessRate => $composableBuilder(
      column: $table.cessRate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get hsnCode => $composableBuilder(
      column: $table.hsnCode,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get image => $composableBuilder(
      column: $table.image,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$ProductsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $ProductsTable> {
        $$ProductsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get sku => $composableBuilder(
      column: $table.sku,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get unit => $composableBuilder(
      column: $table.unit,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get secondaryUnit => $composableBuilder(
      column: $table.secondaryUnit,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get conversionFactor => $composableBuilder(
      column: $table.conversionFactor,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get costPrice => $composableBuilder(
      column: $table.costPrice,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get sellingPrice => $composableBuilder(
      column: $table.sellingPrice,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get stock => $composableBuilder(
      column: $table.stock,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get taxRate => $composableBuilder(
      column: $table.taxRate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get cessRate => $composableBuilder(
      column: $table.cessRate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get hsnCode => $composableBuilder(
      column: $table.hsnCode,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get image => $composableBuilder(
      column: $table.image,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$ProductsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $ProductsTable> {
        $$ProductsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get sku => $composableBuilder(
      column: $table.sku,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => column);
      
GeneratedColumn<String> get unit => $composableBuilder(
      column: $table.unit,
      builder: (column) => column);
      
GeneratedColumn<String> get secondaryUnit => $composableBuilder(
      column: $table.secondaryUnit,
      builder: (column) => column);
      
GeneratedColumn<double> get conversionFactor => $composableBuilder(
      column: $table.conversionFactor,
      builder: (column) => column);
      
GeneratedColumn<double> get costPrice => $composableBuilder(
      column: $table.costPrice,
      builder: (column) => column);
      
GeneratedColumn<double> get sellingPrice => $composableBuilder(
      column: $table.sellingPrice,
      builder: (column) => column);
      
GeneratedColumn<double> get stock => $composableBuilder(
      column: $table.stock,
      builder: (column) => column);
      
GeneratedColumn<double> get taxRate => $composableBuilder(
      column: $table.taxRate,
      builder: (column) => column);
      
GeneratedColumn<double> get cessRate => $composableBuilder(
      column: $table.cessRate,
      builder: (column) => column);
      
GeneratedColumn<String> get hsnCode => $composableBuilder(
      column: $table.hsnCode,
      builder: (column) => column);
      
GeneratedColumn<String> get image => $composableBuilder(
      column: $table.image,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$ProductsTableTableManager extends RootTableManager    <_$AppDatabase,
    $ProductsTable,
    Product,
    $$ProductsTableFilterComposer,
    $$ProductsTableOrderingComposer,
    $$ProductsTableAnnotationComposer,
    $$ProductsTableCreateCompanionBuilder,
    $$ProductsTableUpdateCompanionBuilder,
    (Product,BaseReferences<_$AppDatabase,$ProductsTable,Product>),
    Product,
    PrefetchHooks Function()
    > {
    $$ProductsTableTableManager(_$AppDatabase db, $ProductsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$ProductsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$ProductsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$ProductsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> sku = const Value.absent(),Value<String> name = const Value.absent(),Value<String?> category = const Value.absent(),Value<String?> unit = const Value.absent(),Value<String?> secondaryUnit = const Value.absent(),Value<double?> conversionFactor = const Value.absent(),Value<double> costPrice = const Value.absent(),Value<double> sellingPrice = const Value.absent(),Value<double> stock = const Value.absent(),Value<double> taxRate = const Value.absent(),Value<double> cessRate = const Value.absent(),Value<String?> hsnCode = const Value.absent(),Value<String?> image = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ProductsCompanion(id: id,tenantId: tenantId,sku: sku,name: name,category: category,unit: unit,secondaryUnit: secondaryUnit,conversionFactor: conversionFactor,costPrice: costPrice,sellingPrice: sellingPrice,stock: stock,taxRate: taxRate,cessRate: cessRate,hsnCode: hsnCode,image: image,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> sku = const Value.absent(),required String name,Value<String?> category = const Value.absent(),Value<String?> unit = const Value.absent(),Value<String?> secondaryUnit = const Value.absent(),Value<double?> conversionFactor = const Value.absent(),Value<double> costPrice = const Value.absent(),Value<double> sellingPrice = const Value.absent(),Value<double> stock = const Value.absent(),Value<double> taxRate = const Value.absent(),Value<double> cessRate = const Value.absent(),Value<String?> hsnCode = const Value.absent(),Value<String?> image = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ProductsCompanion.insert(id: id,tenantId: tenantId,sku: sku,name: name,category: category,unit: unit,secondaryUnit: secondaryUnit,conversionFactor: conversionFactor,costPrice: costPrice,sellingPrice: sellingPrice,stock: stock,taxRate: taxRate,cessRate: cessRate,hsnCode: hsnCode,image: image,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$ProductsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $ProductsTable,
    Product,
    $$ProductsTableFilterComposer,
    $$ProductsTableOrderingComposer,
    $$ProductsTableAnnotationComposer,
    $$ProductsTableCreateCompanionBuilder,
    $$ProductsTableUpdateCompanionBuilder,
    (Product,BaseReferences<_$AppDatabase,$ProductsTable,Product>),
    Product,
    PrefetchHooks Function()
    >;typedef $$ClientsTableCreateCompanionBuilder = ClientsCompanion Function({required String id,required String tenantId,required String name,Value<String?> email,Value<String?> phone,Value<String?> address,Value<double> balance,Value<double> outstandingBalance,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$ClientsTableUpdateCompanionBuilder = ClientsCompanion Function({Value<String> id,Value<String> tenantId,Value<String> name,Value<String?> email,Value<String?> phone,Value<String?> address,Value<double> balance,Value<double> outstandingBalance,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$ClientsTableFilterComposer extends Composer<
        _$AppDatabase,
        $ClientsTable> {
        $$ClientsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get outstandingBalance => $composableBuilder(
      column: $table.outstandingBalance,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$ClientsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $ClientsTable> {
        $$ClientsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get outstandingBalance => $composableBuilder(
      column: $table.outstandingBalance,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$ClientsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $ClientsTable> {
        $$ClientsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => column);
      
GeneratedColumn<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => column);
      
GeneratedColumn<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => column);
      
GeneratedColumn<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => column);
      
GeneratedColumn<double> get outstandingBalance => $composableBuilder(
      column: $table.outstandingBalance,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$ClientsTableTableManager extends RootTableManager    <_$AppDatabase,
    $ClientsTable,
    Client,
    $$ClientsTableFilterComposer,
    $$ClientsTableOrderingComposer,
    $$ClientsTableAnnotationComposer,
    $$ClientsTableCreateCompanionBuilder,
    $$ClientsTableUpdateCompanionBuilder,
    (Client,BaseReferences<_$AppDatabase,$ClientsTable,Client>),
    Client,
    PrefetchHooks Function()
    > {
    $$ClientsTableTableManager(_$AppDatabase db, $ClientsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$ClientsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$ClientsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$ClientsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> name = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> address = const Value.absent(),Value<double> balance = const Value.absent(),Value<double> outstandingBalance = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ClientsCompanion(id: id,tenantId: tenantId,name: name,email: email,phone: phone,address: address,balance: balance,outstandingBalance: outstandingBalance,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String name,Value<String?> email = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> address = const Value.absent(),Value<double> balance = const Value.absent(),Value<double> outstandingBalance = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ClientsCompanion.insert(id: id,tenantId: tenantId,name: name,email: email,phone: phone,address: address,balance: balance,outstandingBalance: outstandingBalance,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$ClientsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $ClientsTable,
    Client,
    $$ClientsTableFilterComposer,
    $$ClientsTableOrderingComposer,
    $$ClientsTableAnnotationComposer,
    $$ClientsTableCreateCompanionBuilder,
    $$ClientsTableUpdateCompanionBuilder,
    (Client,BaseReferences<_$AppDatabase,$ClientsTable,Client>),
    Client,
    PrefetchHooks Function()
    >;typedef $$SalesTableCreateCompanionBuilder = SalesCompanion Function({required String id,required String tenantId,Value<String?> clientId,required String paymentMethod,required String paymentStatus,required double subtotal,required double tax,required double totalAmount,Value<double> paidAmount,required DateTime date,required String itemsJson,Value<int> rowid,});
typedef $$SalesTableUpdateCompanionBuilder = SalesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> clientId,Value<String> paymentMethod,Value<String> paymentStatus,Value<double> subtotal,Value<double> tax,Value<double> totalAmount,Value<double> paidAmount,Value<DateTime> date,Value<String> itemsJson,Value<int> rowid,});
class $$SalesTableFilterComposer extends Composer<
        _$AppDatabase,
        $SalesTable> {
        $$SalesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get subtotal => $composableBuilder(
      column: $table.subtotal,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get tax => $composableBuilder(
      column: $table.tax,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$SalesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $SalesTable> {
        $$SalesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get subtotal => $composableBuilder(
      column: $table.subtotal,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get tax => $composableBuilder(
      column: $table.tax,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$SalesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $SalesTable> {
        $$SalesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => column);
      
GeneratedColumn<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => column);
      
GeneratedColumn<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => column);
      
GeneratedColumn<double> get subtotal => $composableBuilder(
      column: $table.subtotal,
      builder: (column) => column);
      
GeneratedColumn<double> get tax => $composableBuilder(
      column: $table.tax,
      builder: (column) => column);
      
GeneratedColumn<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => column);
      
GeneratedColumn<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
GeneratedColumn<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => column);
      
        }
      class $$SalesTableTableManager extends RootTableManager    <_$AppDatabase,
    $SalesTable,
    Sale,
    $$SalesTableFilterComposer,
    $$SalesTableOrderingComposer,
    $$SalesTableAnnotationComposer,
    $$SalesTableCreateCompanionBuilder,
    $$SalesTableUpdateCompanionBuilder,
    (Sale,BaseReferences<_$AppDatabase,$SalesTable,Sale>),
    Sale,
    PrefetchHooks Function()
    > {
    $$SalesTableTableManager(_$AppDatabase db, $SalesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$SalesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$SalesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$SalesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String> paymentMethod = const Value.absent(),Value<String> paymentStatus = const Value.absent(),Value<double> subtotal = const Value.absent(),Value<double> tax = const Value.absent(),Value<double> totalAmount = const Value.absent(),Value<double> paidAmount = const Value.absent(),Value<DateTime> date = const Value.absent(),Value<String> itemsJson = const Value.absent(),Value<int> rowid = const Value.absent(),})=> SalesCompanion(id: id,tenantId: tenantId,clientId: clientId,paymentMethod: paymentMethod,paymentStatus: paymentStatus,subtotal: subtotal,tax: tax,totalAmount: totalAmount,paidAmount: paidAmount,date: date,itemsJson: itemsJson,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> clientId = const Value.absent(),required String paymentMethod,required String paymentStatus,required double subtotal,required double tax,required double totalAmount,Value<double> paidAmount = const Value.absent(),required DateTime date,required String itemsJson,Value<int> rowid = const Value.absent(),})=> SalesCompanion.insert(id: id,tenantId: tenantId,clientId: clientId,paymentMethod: paymentMethod,paymentStatus: paymentStatus,subtotal: subtotal,tax: tax,totalAmount: totalAmount,paidAmount: paidAmount,date: date,itemsJson: itemsJson,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$SalesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $SalesTable,
    Sale,
    $$SalesTableFilterComposer,
    $$SalesTableOrderingComposer,
    $$SalesTableAnnotationComposer,
    $$SalesTableCreateCompanionBuilder,
    $$SalesTableUpdateCompanionBuilder,
    (Sale,BaseReferences<_$AppDatabase,$SalesTable,Sale>),
    Sale,
    PrefetchHooks Function()
    >;typedef $$ExpensesTableCreateCompanionBuilder = ExpensesCompanion Function({required String id,required String tenantId,required String category,required double amount,Value<String?> note,required DateTime date,Value<int> rowid,});
typedef $$ExpensesTableUpdateCompanionBuilder = ExpensesCompanion Function({Value<String> id,Value<String> tenantId,Value<String> category,Value<double> amount,Value<String?> note,Value<DateTime> date,Value<int> rowid,});
class $$ExpensesTableFilterComposer extends Composer<
        _$AppDatabase,
        $ExpensesTable> {
        $$ExpensesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$ExpensesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $ExpensesTable> {
        $$ExpensesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$ExpensesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $ExpensesTable> {
        $$ExpensesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get category => $composableBuilder(
      column: $table.category,
      builder: (column) => column);
      
GeneratedColumn<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => column);
      
GeneratedColumn<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
        }
      class $$ExpensesTableTableManager extends RootTableManager    <_$AppDatabase,
    $ExpensesTable,
    Expense,
    $$ExpensesTableFilterComposer,
    $$ExpensesTableOrderingComposer,
    $$ExpensesTableAnnotationComposer,
    $$ExpensesTableCreateCompanionBuilder,
    $$ExpensesTableUpdateCompanionBuilder,
    (Expense,BaseReferences<_$AppDatabase,$ExpensesTable,Expense>),
    Expense,
    PrefetchHooks Function()
    > {
    $$ExpensesTableTableManager(_$AppDatabase db, $ExpensesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$ExpensesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$ExpensesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$ExpensesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> category = const Value.absent(),Value<double> amount = const Value.absent(),Value<String?> note = const Value.absent(),Value<DateTime> date = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ExpensesCompanion(id: id,tenantId: tenantId,category: category,amount: amount,note: note,date: date,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String category,required double amount,Value<String?> note = const Value.absent(),required DateTime date,Value<int> rowid = const Value.absent(),})=> ExpensesCompanion.insert(id: id,tenantId: tenantId,category: category,amount: amount,note: note,date: date,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$ExpensesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $ExpensesTable,
    Expense,
    $$ExpensesTableFilterComposer,
    $$ExpensesTableOrderingComposer,
    $$ExpensesTableAnnotationComposer,
    $$ExpensesTableCreateCompanionBuilder,
    $$ExpensesTableUpdateCompanionBuilder,
    (Expense,BaseReferences<_$AppDatabase,$ExpensesTable,Expense>),
    Expense,
    PrefetchHooks Function()
    >;typedef $$SuppliersTableCreateCompanionBuilder = SuppliersCompanion Function({required String id,required String tenantId,required String name,Value<String?> contactPerson,Value<String?> phone,Value<double> balance,Value<int> rowid,});
typedef $$SuppliersTableUpdateCompanionBuilder = SuppliersCompanion Function({Value<String> id,Value<String> tenantId,Value<String> name,Value<String?> contactPerson,Value<String?> phone,Value<double> balance,Value<int> rowid,});
class $$SuppliersTableFilterComposer extends Composer<
        _$AppDatabase,
        $SuppliersTable> {
        $$SuppliersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get contactPerson => $composableBuilder(
      column: $table.contactPerson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$SuppliersTableOrderingComposer extends Composer<
        _$AppDatabase,
        $SuppliersTable> {
        $$SuppliersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get contactPerson => $composableBuilder(
      column: $table.contactPerson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$SuppliersTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $SuppliersTable> {
        $$SuppliersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get contactPerson => $composableBuilder(
      column: $table.contactPerson,
      builder: (column) => column);
      
GeneratedColumn<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => column);
      
GeneratedColumn<double> get balance => $composableBuilder(
      column: $table.balance,
      builder: (column) => column);
      
        }
      class $$SuppliersTableTableManager extends RootTableManager    <_$AppDatabase,
    $SuppliersTable,
    Supplier,
    $$SuppliersTableFilterComposer,
    $$SuppliersTableOrderingComposer,
    $$SuppliersTableAnnotationComposer,
    $$SuppliersTableCreateCompanionBuilder,
    $$SuppliersTableUpdateCompanionBuilder,
    (Supplier,BaseReferences<_$AppDatabase,$SuppliersTable,Supplier>),
    Supplier,
    PrefetchHooks Function()
    > {
    $$SuppliersTableTableManager(_$AppDatabase db, $SuppliersTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$SuppliersTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$SuppliersTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$SuppliersTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> name = const Value.absent(),Value<String?> contactPerson = const Value.absent(),Value<String?> phone = const Value.absent(),Value<double> balance = const Value.absent(),Value<int> rowid = const Value.absent(),})=> SuppliersCompanion(id: id,tenantId: tenantId,name: name,contactPerson: contactPerson,phone: phone,balance: balance,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String name,Value<String?> contactPerson = const Value.absent(),Value<String?> phone = const Value.absent(),Value<double> balance = const Value.absent(),Value<int> rowid = const Value.absent(),})=> SuppliersCompanion.insert(id: id,tenantId: tenantId,name: name,contactPerson: contactPerson,phone: phone,balance: balance,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$SuppliersTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $SuppliersTable,
    Supplier,
    $$SuppliersTableFilterComposer,
    $$SuppliersTableOrderingComposer,
    $$SuppliersTableAnnotationComposer,
    $$SuppliersTableCreateCompanionBuilder,
    $$SuppliersTableUpdateCompanionBuilder,
    (Supplier,BaseReferences<_$AppDatabase,$SuppliersTable,Supplier>),
    Supplier,
    PrefetchHooks Function()
    >;typedef $$PurchasesTableCreateCompanionBuilder = PurchasesCompanion Function({required String id,required String tenantId,Value<String?> supplierId,Value<String?> productId,required double quantity,required double totalAmount,required DateTime date,Value<int> rowid,});
typedef $$PurchasesTableUpdateCompanionBuilder = PurchasesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> supplierId,Value<String?> productId,Value<double> quantity,Value<double> totalAmount,Value<DateTime> date,Value<int> rowid,});
class $$PurchasesTableFilterComposer extends Composer<
        _$AppDatabase,
        $PurchasesTable> {
        $$PurchasesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$PurchasesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $PurchasesTable> {
        $$PurchasesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$PurchasesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $PurchasesTable> {
        $$PurchasesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => column);
      
GeneratedColumn<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => column);
      
GeneratedColumn<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => column);
      
GeneratedColumn<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
        }
      class $$PurchasesTableTableManager extends RootTableManager    <_$AppDatabase,
    $PurchasesTable,
    Purchase,
    $$PurchasesTableFilterComposer,
    $$PurchasesTableOrderingComposer,
    $$PurchasesTableAnnotationComposer,
    $$PurchasesTableCreateCompanionBuilder,
    $$PurchasesTableUpdateCompanionBuilder,
    (Purchase,BaseReferences<_$AppDatabase,$PurchasesTable,Purchase>),
    Purchase,
    PrefetchHooks Function()
    > {
    $$PurchasesTableTableManager(_$AppDatabase db, $PurchasesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$PurchasesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$PurchasesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$PurchasesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> productId = const Value.absent(),Value<double> quantity = const Value.absent(),Value<double> totalAmount = const Value.absent(),Value<DateTime> date = const Value.absent(),Value<int> rowid = const Value.absent(),})=> PurchasesCompanion(id: id,tenantId: tenantId,supplierId: supplierId,productId: productId,quantity: quantity,totalAmount: totalAmount,date: date,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> supplierId = const Value.absent(),Value<String?> productId = const Value.absent(),required double quantity,required double totalAmount,required DateTime date,Value<int> rowid = const Value.absent(),})=> PurchasesCompanion.insert(id: id,tenantId: tenantId,supplierId: supplierId,productId: productId,quantity: quantity,totalAmount: totalAmount,date: date,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$PurchasesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $PurchasesTable,
    Purchase,
    $$PurchasesTableFilterComposer,
    $$PurchasesTableOrderingComposer,
    $$PurchasesTableAnnotationComposer,
    $$PurchasesTableCreateCompanionBuilder,
    $$PurchasesTableUpdateCompanionBuilder,
    (Purchase,BaseReferences<_$AppDatabase,$PurchasesTable,Purchase>),
    Purchase,
    PrefetchHooks Function()
    >;typedef $$InvoicesTableCreateCompanionBuilder = InvoicesCompanion Function({required String id,required String tenantId,Value<String?> invoiceNumber,Value<String?> clientId,Value<String?> clientName,Value<String?> saleId,Value<String?> invoiceDate,Value<String?> dueDate,Value<double> taxableAmount,Value<double> grandTotal,Value<double> paidAmount,Value<String?> paymentStatus,Value<String?> irn,Value<String?> irnStatus,Value<String?> ackNo,Value<String?> signedQr,Value<String?> itemsJson,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$InvoicesTableUpdateCompanionBuilder = InvoicesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> invoiceNumber,Value<String?> clientId,Value<String?> clientName,Value<String?> saleId,Value<String?> invoiceDate,Value<String?> dueDate,Value<double> taxableAmount,Value<double> grandTotal,Value<double> paidAmount,Value<String?> paymentStatus,Value<String?> irn,Value<String?> irnStatus,Value<String?> ackNo,Value<String?> signedQr,Value<String?> itemsJson,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$InvoicesTableFilterComposer extends Composer<
        _$AppDatabase,
        $InvoicesTable> {
        $$InvoicesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get invoiceNumber => $composableBuilder(
      column: $table.invoiceNumber,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get saleId => $composableBuilder(
      column: $table.saleId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get invoiceDate => $composableBuilder(
      column: $table.invoiceDate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get dueDate => $composableBuilder(
      column: $table.dueDate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get taxableAmount => $composableBuilder(
      column: $table.taxableAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get grandTotal => $composableBuilder(
      column: $table.grandTotal,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get irn => $composableBuilder(
      column: $table.irn,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get irnStatus => $composableBuilder(
      column: $table.irnStatus,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get ackNo => $composableBuilder(
      column: $table.ackNo,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get signedQr => $composableBuilder(
      column: $table.signedQr,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$InvoicesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $InvoicesTable> {
        $$InvoicesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get invoiceNumber => $composableBuilder(
      column: $table.invoiceNumber,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get saleId => $composableBuilder(
      column: $table.saleId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get invoiceDate => $composableBuilder(
      column: $table.invoiceDate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get dueDate => $composableBuilder(
      column: $table.dueDate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get taxableAmount => $composableBuilder(
      column: $table.taxableAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get grandTotal => $composableBuilder(
      column: $table.grandTotal,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get irn => $composableBuilder(
      column: $table.irn,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get irnStatus => $composableBuilder(
      column: $table.irnStatus,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get ackNo => $composableBuilder(
      column: $table.ackNo,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get signedQr => $composableBuilder(
      column: $table.signedQr,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$InvoicesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $InvoicesTable> {
        $$InvoicesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get invoiceNumber => $composableBuilder(
      column: $table.invoiceNumber,
      builder: (column) => column);
      
GeneratedColumn<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => column);
      
GeneratedColumn<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => column);
      
GeneratedColumn<String> get saleId => $composableBuilder(
      column: $table.saleId,
      builder: (column) => column);
      
GeneratedColumn<String> get invoiceDate => $composableBuilder(
      column: $table.invoiceDate,
      builder: (column) => column);
      
GeneratedColumn<String> get dueDate => $composableBuilder(
      column: $table.dueDate,
      builder: (column) => column);
      
GeneratedColumn<double> get taxableAmount => $composableBuilder(
      column: $table.taxableAmount,
      builder: (column) => column);
      
GeneratedColumn<double> get grandTotal => $composableBuilder(
      column: $table.grandTotal,
      builder: (column) => column);
      
GeneratedColumn<double> get paidAmount => $composableBuilder(
      column: $table.paidAmount,
      builder: (column) => column);
      
GeneratedColumn<String> get paymentStatus => $composableBuilder(
      column: $table.paymentStatus,
      builder: (column) => column);
      
GeneratedColumn<String> get irn => $composableBuilder(
      column: $table.irn,
      builder: (column) => column);
      
GeneratedColumn<String> get irnStatus => $composableBuilder(
      column: $table.irnStatus,
      builder: (column) => column);
      
GeneratedColumn<String> get ackNo => $composableBuilder(
      column: $table.ackNo,
      builder: (column) => column);
      
GeneratedColumn<String> get signedQr => $composableBuilder(
      column: $table.signedQr,
      builder: (column) => column);
      
GeneratedColumn<String> get itemsJson => $composableBuilder(
      column: $table.itemsJson,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$InvoicesTableTableManager extends RootTableManager    <_$AppDatabase,
    $InvoicesTable,
    Invoice,
    $$InvoicesTableFilterComposer,
    $$InvoicesTableOrderingComposer,
    $$InvoicesTableAnnotationComposer,
    $$InvoicesTableCreateCompanionBuilder,
    $$InvoicesTableUpdateCompanionBuilder,
    (Invoice,BaseReferences<_$AppDatabase,$InvoicesTable,Invoice>),
    Invoice,
    PrefetchHooks Function()
    > {
    $$InvoicesTableTableManager(_$AppDatabase db, $InvoicesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$InvoicesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$InvoicesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$InvoicesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> invoiceNumber = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<String?> saleId = const Value.absent(),Value<String?> invoiceDate = const Value.absent(),Value<String?> dueDate = const Value.absent(),Value<double> taxableAmount = const Value.absent(),Value<double> grandTotal = const Value.absent(),Value<double> paidAmount = const Value.absent(),Value<String?> paymentStatus = const Value.absent(),Value<String?> irn = const Value.absent(),Value<String?> irnStatus = const Value.absent(),Value<String?> ackNo = const Value.absent(),Value<String?> signedQr = const Value.absent(),Value<String?> itemsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InvoicesCompanion(id: id,tenantId: tenantId,invoiceNumber: invoiceNumber,clientId: clientId,clientName: clientName,saleId: saleId,invoiceDate: invoiceDate,dueDate: dueDate,taxableAmount: taxableAmount,grandTotal: grandTotal,paidAmount: paidAmount,paymentStatus: paymentStatus,irn: irn,irnStatus: irnStatus,ackNo: ackNo,signedQr: signedQr,itemsJson: itemsJson,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> invoiceNumber = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<String?> saleId = const Value.absent(),Value<String?> invoiceDate = const Value.absent(),Value<String?> dueDate = const Value.absent(),Value<double> taxableAmount = const Value.absent(),Value<double> grandTotal = const Value.absent(),Value<double> paidAmount = const Value.absent(),Value<String?> paymentStatus = const Value.absent(),Value<String?> irn = const Value.absent(),Value<String?> irnStatus = const Value.absent(),Value<String?> ackNo = const Value.absent(),Value<String?> signedQr = const Value.absent(),Value<String?> itemsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InvoicesCompanion.insert(id: id,tenantId: tenantId,invoiceNumber: invoiceNumber,clientId: clientId,clientName: clientName,saleId: saleId,invoiceDate: invoiceDate,dueDate: dueDate,taxableAmount: taxableAmount,grandTotal: grandTotal,paidAmount: paidAmount,paymentStatus: paymentStatus,irn: irn,irnStatus: irnStatus,ackNo: ackNo,signedQr: signedQr,itemsJson: itemsJson,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$InvoicesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $InvoicesTable,
    Invoice,
    $$InvoicesTableFilterComposer,
    $$InvoicesTableOrderingComposer,
    $$InvoicesTableAnnotationComposer,
    $$InvoicesTableCreateCompanionBuilder,
    $$InvoicesTableUpdateCompanionBuilder,
    (Invoice,BaseReferences<_$AppDatabase,$InvoicesTable,Invoice>),
    Invoice,
    PrefetchHooks Function()
    >;typedef $$BusinessProfileLocalTableCreateCompanionBuilder = BusinessProfileLocalCompanion Function({required String tenantId,Value<String?> name,Value<String?> address,Value<String?> phone,Value<String?> email,Value<String?> currency,Value<String?> gstNo,Value<String?> panNo,Value<String?> upiId,Value<String?> invoiceTerms,Value<String?> footerMessage,Value<bool> autoIrnEnabled,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$BusinessProfileLocalTableUpdateCompanionBuilder = BusinessProfileLocalCompanion Function({Value<String> tenantId,Value<String?> name,Value<String?> address,Value<String?> phone,Value<String?> email,Value<String?> currency,Value<String?> gstNo,Value<String?> panNo,Value<String?> upiId,Value<String?> invoiceTerms,Value<String?> footerMessage,Value<bool> autoIrnEnabled,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$BusinessProfileLocalTableFilterComposer extends Composer<
        _$AppDatabase,
        $BusinessProfileLocalTable> {
        $$BusinessProfileLocalTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get currency => $composableBuilder(
      column: $table.currency,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get gstNo => $composableBuilder(
      column: $table.gstNo,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get panNo => $composableBuilder(
      column: $table.panNo,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get upiId => $composableBuilder(
      column: $table.upiId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get invoiceTerms => $composableBuilder(
      column: $table.invoiceTerms,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get footerMessage => $composableBuilder(
      column: $table.footerMessage,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<bool> get autoIrnEnabled => $composableBuilder(
      column: $table.autoIrnEnabled,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$BusinessProfileLocalTableOrderingComposer extends Composer<
        _$AppDatabase,
        $BusinessProfileLocalTable> {
        $$BusinessProfileLocalTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get currency => $composableBuilder(
      column: $table.currency,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get gstNo => $composableBuilder(
      column: $table.gstNo,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get panNo => $composableBuilder(
      column: $table.panNo,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get upiId => $composableBuilder(
      column: $table.upiId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get invoiceTerms => $composableBuilder(
      column: $table.invoiceTerms,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get footerMessage => $composableBuilder(
      column: $table.footerMessage,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<bool> get autoIrnEnabled => $composableBuilder(
      column: $table.autoIrnEnabled,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$BusinessProfileLocalTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $BusinessProfileLocalTable> {
        $$BusinessProfileLocalTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get address => $composableBuilder(
      column: $table.address,
      builder: (column) => column);
      
GeneratedColumn<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => column);
      
GeneratedColumn<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => column);
      
GeneratedColumn<String> get currency => $composableBuilder(
      column: $table.currency,
      builder: (column) => column);
      
GeneratedColumn<String> get gstNo => $composableBuilder(
      column: $table.gstNo,
      builder: (column) => column);
      
GeneratedColumn<String> get panNo => $composableBuilder(
      column: $table.panNo,
      builder: (column) => column);
      
GeneratedColumn<String> get upiId => $composableBuilder(
      column: $table.upiId,
      builder: (column) => column);
      
GeneratedColumn<String> get invoiceTerms => $composableBuilder(
      column: $table.invoiceTerms,
      builder: (column) => column);
      
GeneratedColumn<String> get footerMessage => $composableBuilder(
      column: $table.footerMessage,
      builder: (column) => column);
      
GeneratedColumn<bool> get autoIrnEnabled => $composableBuilder(
      column: $table.autoIrnEnabled,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$BusinessProfileLocalTableTableManager extends RootTableManager    <_$AppDatabase,
    $BusinessProfileLocalTable,
    BusinessProfileLocalData,
    $$BusinessProfileLocalTableFilterComposer,
    $$BusinessProfileLocalTableOrderingComposer,
    $$BusinessProfileLocalTableAnnotationComposer,
    $$BusinessProfileLocalTableCreateCompanionBuilder,
    $$BusinessProfileLocalTableUpdateCompanionBuilder,
    (BusinessProfileLocalData,BaseReferences<_$AppDatabase,$BusinessProfileLocalTable,BusinessProfileLocalData>),
    BusinessProfileLocalData,
    PrefetchHooks Function()
    > {
    $$BusinessProfileLocalTableTableManager(_$AppDatabase db, $BusinessProfileLocalTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$BusinessProfileLocalTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$BusinessProfileLocalTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$BusinessProfileLocalTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> tenantId = const Value.absent(),Value<String?> name = const Value.absent(),Value<String?> address = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> currency = const Value.absent(),Value<String?> gstNo = const Value.absent(),Value<String?> panNo = const Value.absent(),Value<String?> upiId = const Value.absent(),Value<String?> invoiceTerms = const Value.absent(),Value<String?> footerMessage = const Value.absent(),Value<bool> autoIrnEnabled = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> BusinessProfileLocalCompanion(tenantId: tenantId,name: name,address: address,phone: phone,email: email,currency: currency,gstNo: gstNo,panNo: panNo,upiId: upiId,invoiceTerms: invoiceTerms,footerMessage: footerMessage,autoIrnEnabled: autoIrnEnabled,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String tenantId,Value<String?> name = const Value.absent(),Value<String?> address = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> currency = const Value.absent(),Value<String?> gstNo = const Value.absent(),Value<String?> panNo = const Value.absent(),Value<String?> upiId = const Value.absent(),Value<String?> invoiceTerms = const Value.absent(),Value<String?> footerMessage = const Value.absent(),Value<bool> autoIrnEnabled = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> BusinessProfileLocalCompanion.insert(tenantId: tenantId,name: name,address: address,phone: phone,email: email,currency: currency,gstNo: gstNo,panNo: panNo,upiId: upiId,invoiceTerms: invoiceTerms,footerMessage: footerMessage,autoIrnEnabled: autoIrnEnabled,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$BusinessProfileLocalTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $BusinessProfileLocalTable,
    BusinessProfileLocalData,
    $$BusinessProfileLocalTableFilterComposer,
    $$BusinessProfileLocalTableOrderingComposer,
    $$BusinessProfileLocalTableAnnotationComposer,
    $$BusinessProfileLocalTableCreateCompanionBuilder,
    $$BusinessProfileLocalTableUpdateCompanionBuilder,
    (BusinessProfileLocalData,BaseReferences<_$AppDatabase,$BusinessProfileLocalTable,BusinessProfileLocalData>),
    BusinessProfileLocalData,
    PrefetchHooks Function()
    >;typedef $$RoutesTableCreateCompanionBuilder = RoutesCompanion Function({required String id,required String tenantId,Value<String?> vehicleId,Value<String?> driverId,required String status,Value<String?> location,Value<double?> initialOdometer,Value<double?> finalOdometer,Value<double?> actualCash,Value<String?> assignedOrdersJson,required DateTime date,Value<int> rowid,});
typedef $$RoutesTableUpdateCompanionBuilder = RoutesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> vehicleId,Value<String?> driverId,Value<String> status,Value<String?> location,Value<double?> initialOdometer,Value<double?> finalOdometer,Value<double?> actualCash,Value<String?> assignedOrdersJson,Value<DateTime> date,Value<int> rowid,});
class $$RoutesTableFilterComposer extends Composer<
        _$AppDatabase,
        $RoutesTable> {
        $$RoutesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get vehicleId => $composableBuilder(
      column: $table.vehicleId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get driverId => $composableBuilder(
      column: $table.driverId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get location => $composableBuilder(
      column: $table.location,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get initialOdometer => $composableBuilder(
      column: $table.initialOdometer,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get finalOdometer => $composableBuilder(
      column: $table.finalOdometer,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get actualCash => $composableBuilder(
      column: $table.actualCash,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get assignedOrdersJson => $composableBuilder(
      column: $table.assignedOrdersJson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$RoutesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $RoutesTable> {
        $$RoutesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get vehicleId => $composableBuilder(
      column: $table.vehicleId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get driverId => $composableBuilder(
      column: $table.driverId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get location => $composableBuilder(
      column: $table.location,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get initialOdometer => $composableBuilder(
      column: $table.initialOdometer,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get finalOdometer => $composableBuilder(
      column: $table.finalOdometer,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get actualCash => $composableBuilder(
      column: $table.actualCash,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get assignedOrdersJson => $composableBuilder(
      column: $table.assignedOrdersJson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$RoutesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $RoutesTable> {
        $$RoutesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get vehicleId => $composableBuilder(
      column: $table.vehicleId,
      builder: (column) => column);
      
GeneratedColumn<String> get driverId => $composableBuilder(
      column: $table.driverId,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<String> get location => $composableBuilder(
      column: $table.location,
      builder: (column) => column);
      
GeneratedColumn<double> get initialOdometer => $composableBuilder(
      column: $table.initialOdometer,
      builder: (column) => column);
      
GeneratedColumn<double> get finalOdometer => $composableBuilder(
      column: $table.finalOdometer,
      builder: (column) => column);
      
GeneratedColumn<double> get actualCash => $composableBuilder(
      column: $table.actualCash,
      builder: (column) => column);
      
GeneratedColumn<String> get assignedOrdersJson => $composableBuilder(
      column: $table.assignedOrdersJson,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
        }
      class $$RoutesTableTableManager extends RootTableManager    <_$AppDatabase,
    $RoutesTable,
    Route,
    $$RoutesTableFilterComposer,
    $$RoutesTableOrderingComposer,
    $$RoutesTableAnnotationComposer,
    $$RoutesTableCreateCompanionBuilder,
    $$RoutesTableUpdateCompanionBuilder,
    (Route,BaseReferences<_$AppDatabase,$RoutesTable,Route>),
    Route,
    PrefetchHooks Function()
    > {
    $$RoutesTableTableManager(_$AppDatabase db, $RoutesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$RoutesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$RoutesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$RoutesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> vehicleId = const Value.absent(),Value<String?> driverId = const Value.absent(),Value<String> status = const Value.absent(),Value<String?> location = const Value.absent(),Value<double?> initialOdometer = const Value.absent(),Value<double?> finalOdometer = const Value.absent(),Value<double?> actualCash = const Value.absent(),Value<String?> assignedOrdersJson = const Value.absent(),Value<DateTime> date = const Value.absent(),Value<int> rowid = const Value.absent(),})=> RoutesCompanion(id: id,tenantId: tenantId,vehicleId: vehicleId,driverId: driverId,status: status,location: location,initialOdometer: initialOdometer,finalOdometer: finalOdometer,actualCash: actualCash,assignedOrdersJson: assignedOrdersJson,date: date,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> vehicleId = const Value.absent(),Value<String?> driverId = const Value.absent(),required String status,Value<String?> location = const Value.absent(),Value<double?> initialOdometer = const Value.absent(),Value<double?> finalOdometer = const Value.absent(),Value<double?> actualCash = const Value.absent(),Value<String?> assignedOrdersJson = const Value.absent(),required DateTime date,Value<int> rowid = const Value.absent(),})=> RoutesCompanion.insert(id: id,tenantId: tenantId,vehicleId: vehicleId,driverId: driverId,status: status,location: location,initialOdometer: initialOdometer,finalOdometer: finalOdometer,actualCash: actualCash,assignedOrdersJson: assignedOrdersJson,date: date,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$RoutesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $RoutesTable,
    Route,
    $$RoutesTableFilterComposer,
    $$RoutesTableOrderingComposer,
    $$RoutesTableAnnotationComposer,
    $$RoutesTableCreateCompanionBuilder,
    $$RoutesTableUpdateCompanionBuilder,
    (Route,BaseReferences<_$AppDatabase,$RoutesTable,Route>),
    Route,
    PrefetchHooks Function()
    >;typedef $$DayBookLocalTableCreateCompanionBuilder = DayBookLocalCompanion Function({required String id,required String tenantId,required String date,Value<String?> locationId,Value<double?> openingBalance,Value<double?> closingBalance,Value<double?> totalSales,Value<double?> totalExpenses,Value<bool> isClosed,Value<DateTime?> closedAt,Value<String?> closedBy,Value<double?> physicalCash,Value<double?> variance,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$DayBookLocalTableUpdateCompanionBuilder = DayBookLocalCompanion Function({Value<String> id,Value<String> tenantId,Value<String> date,Value<String?> locationId,Value<double?> openingBalance,Value<double?> closingBalance,Value<double?> totalSales,Value<double?> totalExpenses,Value<bool> isClosed,Value<DateTime?> closedAt,Value<String?> closedBy,Value<double?> physicalCash,Value<double?> variance,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$DayBookLocalTableFilterComposer extends Composer<
        _$AppDatabase,
        $DayBookLocalTable> {
        $$DayBookLocalTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get openingBalance => $composableBuilder(
      column: $table.openingBalance,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get closingBalance => $composableBuilder(
      column: $table.closingBalance,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get totalSales => $composableBuilder(
      column: $table.totalSales,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get totalExpenses => $composableBuilder(
      column: $table.totalExpenses,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<bool> get isClosed => $composableBuilder(
      column: $table.isClosed,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get closedAt => $composableBuilder(
      column: $table.closedAt,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get closedBy => $composableBuilder(
      column: $table.closedBy,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get physicalCash => $composableBuilder(
      column: $table.physicalCash,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get variance => $composableBuilder(
      column: $table.variance,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$DayBookLocalTableOrderingComposer extends Composer<
        _$AppDatabase,
        $DayBookLocalTable> {
        $$DayBookLocalTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get openingBalance => $composableBuilder(
      column: $table.openingBalance,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get closingBalance => $composableBuilder(
      column: $table.closingBalance,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get totalSales => $composableBuilder(
      column: $table.totalSales,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get totalExpenses => $composableBuilder(
      column: $table.totalExpenses,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<bool> get isClosed => $composableBuilder(
      column: $table.isClosed,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get closedAt => $composableBuilder(
      column: $table.closedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get closedBy => $composableBuilder(
      column: $table.closedBy,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get physicalCash => $composableBuilder(
      column: $table.physicalCash,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get variance => $composableBuilder(
      column: $table.variance,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$DayBookLocalTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $DayBookLocalTable> {
        $$DayBookLocalTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
GeneratedColumn<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => column);
      
GeneratedColumn<double> get openingBalance => $composableBuilder(
      column: $table.openingBalance,
      builder: (column) => column);
      
GeneratedColumn<double> get closingBalance => $composableBuilder(
      column: $table.closingBalance,
      builder: (column) => column);
      
GeneratedColumn<double> get totalSales => $composableBuilder(
      column: $table.totalSales,
      builder: (column) => column);
      
GeneratedColumn<double> get totalExpenses => $composableBuilder(
      column: $table.totalExpenses,
      builder: (column) => column);
      
GeneratedColumn<bool> get isClosed => $composableBuilder(
      column: $table.isClosed,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get closedAt => $composableBuilder(
      column: $table.closedAt,
      builder: (column) => column);
      
GeneratedColumn<String> get closedBy => $composableBuilder(
      column: $table.closedBy,
      builder: (column) => column);
      
GeneratedColumn<double> get physicalCash => $composableBuilder(
      column: $table.physicalCash,
      builder: (column) => column);
      
GeneratedColumn<double> get variance => $composableBuilder(
      column: $table.variance,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$DayBookLocalTableTableManager extends RootTableManager    <_$AppDatabase,
    $DayBookLocalTable,
    DayBookLocalData,
    $$DayBookLocalTableFilterComposer,
    $$DayBookLocalTableOrderingComposer,
    $$DayBookLocalTableAnnotationComposer,
    $$DayBookLocalTableCreateCompanionBuilder,
    $$DayBookLocalTableUpdateCompanionBuilder,
    (DayBookLocalData,BaseReferences<_$AppDatabase,$DayBookLocalTable,DayBookLocalData>),
    DayBookLocalData,
    PrefetchHooks Function()
    > {
    $$DayBookLocalTableTableManager(_$AppDatabase db, $DayBookLocalTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$DayBookLocalTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$DayBookLocalTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$DayBookLocalTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> date = const Value.absent(),Value<String?> locationId = const Value.absent(),Value<double?> openingBalance = const Value.absent(),Value<double?> closingBalance = const Value.absent(),Value<double?> totalSales = const Value.absent(),Value<double?> totalExpenses = const Value.absent(),Value<bool> isClosed = const Value.absent(),Value<DateTime?> closedAt = const Value.absent(),Value<String?> closedBy = const Value.absent(),Value<double?> physicalCash = const Value.absent(),Value<double?> variance = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> DayBookLocalCompanion(id: id,tenantId: tenantId,date: date,locationId: locationId,openingBalance: openingBalance,closingBalance: closingBalance,totalSales: totalSales,totalExpenses: totalExpenses,isClosed: isClosed,closedAt: closedAt,closedBy: closedBy,physicalCash: physicalCash,variance: variance,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String date,Value<String?> locationId = const Value.absent(),Value<double?> openingBalance = const Value.absent(),Value<double?> closingBalance = const Value.absent(),Value<double?> totalSales = const Value.absent(),Value<double?> totalExpenses = const Value.absent(),Value<bool> isClosed = const Value.absent(),Value<DateTime?> closedAt = const Value.absent(),Value<String?> closedBy = const Value.absent(),Value<double?> physicalCash = const Value.absent(),Value<double?> variance = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> DayBookLocalCompanion.insert(id: id,tenantId: tenantId,date: date,locationId: locationId,openingBalance: openingBalance,closingBalance: closingBalance,totalSales: totalSales,totalExpenses: totalExpenses,isClosed: isClosed,closedAt: closedAt,closedBy: closedBy,physicalCash: physicalCash,variance: variance,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$DayBookLocalTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $DayBookLocalTable,
    DayBookLocalData,
    $$DayBookLocalTableFilterComposer,
    $$DayBookLocalTableOrderingComposer,
    $$DayBookLocalTableAnnotationComposer,
    $$DayBookLocalTableCreateCompanionBuilder,
    $$DayBookLocalTableUpdateCompanionBuilder,
    (DayBookLocalData,BaseReferences<_$AppDatabase,$DayBookLocalTable,DayBookLocalData>),
    DayBookLocalData,
    PrefetchHooks Function()
    >;typedef $$ClientPaymentsTableCreateCompanionBuilder = ClientPaymentsCompanion Function({required String id,required String tenantId,Value<String?> clientId,Value<double?> amount,Value<String?> date,Value<String?> paymentMethod,Value<String?> notes,Value<String?> recordedBy,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$ClientPaymentsTableUpdateCompanionBuilder = ClientPaymentsCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> clientId,Value<double?> amount,Value<String?> date,Value<String?> paymentMethod,Value<String?> notes,Value<String?> recordedBy,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$ClientPaymentsTableFilterComposer extends Composer<
        _$AppDatabase,
        $ClientPaymentsTable> {
        $$ClientPaymentsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get recordedBy => $composableBuilder(
      column: $table.recordedBy,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$ClientPaymentsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $ClientPaymentsTable> {
        $$ClientPaymentsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get recordedBy => $composableBuilder(
      column: $table.recordedBy,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$ClientPaymentsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $ClientPaymentsTable> {
        $$ClientPaymentsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => column);
      
GeneratedColumn<double> get amount => $composableBuilder(
      column: $table.amount,
      builder: (column) => column);
      
GeneratedColumn<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
GeneratedColumn<String> get paymentMethod => $composableBuilder(
      column: $table.paymentMethod,
      builder: (column) => column);
      
GeneratedColumn<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => column);
      
GeneratedColumn<String> get recordedBy => $composableBuilder(
      column: $table.recordedBy,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$ClientPaymentsTableTableManager extends RootTableManager    <_$AppDatabase,
    $ClientPaymentsTable,
    ClientPayment,
    $$ClientPaymentsTableFilterComposer,
    $$ClientPaymentsTableOrderingComposer,
    $$ClientPaymentsTableAnnotationComposer,
    $$ClientPaymentsTableCreateCompanionBuilder,
    $$ClientPaymentsTableUpdateCompanionBuilder,
    (ClientPayment,BaseReferences<_$AppDatabase,$ClientPaymentsTable,ClientPayment>),
    ClientPayment,
    PrefetchHooks Function()
    > {
    $$ClientPaymentsTableTableManager(_$AppDatabase db, $ClientPaymentsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$ClientPaymentsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$ClientPaymentsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$ClientPaymentsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<double?> amount = const Value.absent(),Value<String?> date = const Value.absent(),Value<String?> paymentMethod = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> recordedBy = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ClientPaymentsCompanion(id: id,tenantId: tenantId,clientId: clientId,amount: amount,date: date,paymentMethod: paymentMethod,notes: notes,recordedBy: recordedBy,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> clientId = const Value.absent(),Value<double?> amount = const Value.absent(),Value<String?> date = const Value.absent(),Value<String?> paymentMethod = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> recordedBy = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ClientPaymentsCompanion.insert(id: id,tenantId: tenantId,clientId: clientId,amount: amount,date: date,paymentMethod: paymentMethod,notes: notes,recordedBy: recordedBy,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$ClientPaymentsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $ClientPaymentsTable,
    ClientPayment,
    $$ClientPaymentsTableFilterComposer,
    $$ClientPaymentsTableOrderingComposer,
    $$ClientPaymentsTableAnnotationComposer,
    $$ClientPaymentsTableCreateCompanionBuilder,
    $$ClientPaymentsTableUpdateCompanionBuilder,
    (ClientPayment,BaseReferences<_$AppDatabase,$ClientPaymentsTable,ClientPayment>),
    ClientPayment,
    PrefetchHooks Function()
    >;typedef $$EmployeesTableCreateCompanionBuilder = EmployeesCompanion Function({required String id,required String tenantId,Value<String?> name,Value<String?> role,Value<String?> position,Value<String?> department,Value<String?> status,Value<String?> payType,Value<double?> salary,Value<double?> dailyRate,Value<double?> daysWorked,Value<double?> amountPaid,Value<String?> phone,Value<String?> email,Value<String?> bankAccount,Value<String?> employmentType,Value<String?> joiningDate,Value<String?> notes,Value<String?> userId,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$EmployeesTableUpdateCompanionBuilder = EmployeesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> name,Value<String?> role,Value<String?> position,Value<String?> department,Value<String?> status,Value<String?> payType,Value<double?> salary,Value<double?> dailyRate,Value<double?> daysWorked,Value<double?> amountPaid,Value<String?> phone,Value<String?> email,Value<String?> bankAccount,Value<String?> employmentType,Value<String?> joiningDate,Value<String?> notes,Value<String?> userId,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$EmployeesTableFilterComposer extends Composer<
        _$AppDatabase,
        $EmployeesTable> {
        $$EmployeesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get role => $composableBuilder(
      column: $table.role,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get position => $composableBuilder(
      column: $table.position,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get department => $composableBuilder(
      column: $table.department,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get payType => $composableBuilder(
      column: $table.payType,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get salary => $composableBuilder(
      column: $table.salary,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get dailyRate => $composableBuilder(
      column: $table.dailyRate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get daysWorked => $composableBuilder(
      column: $table.daysWorked,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get amountPaid => $composableBuilder(
      column: $table.amountPaid,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get bankAccount => $composableBuilder(
      column: $table.bankAccount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get employmentType => $composableBuilder(
      column: $table.employmentType,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get joiningDate => $composableBuilder(
      column: $table.joiningDate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get userId => $composableBuilder(
      column: $table.userId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$EmployeesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $EmployeesTable> {
        $$EmployeesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get role => $composableBuilder(
      column: $table.role,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get position => $composableBuilder(
      column: $table.position,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get department => $composableBuilder(
      column: $table.department,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get payType => $composableBuilder(
      column: $table.payType,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get salary => $composableBuilder(
      column: $table.salary,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get dailyRate => $composableBuilder(
      column: $table.dailyRate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get daysWorked => $composableBuilder(
      column: $table.daysWorked,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get amountPaid => $composableBuilder(
      column: $table.amountPaid,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get bankAccount => $composableBuilder(
      column: $table.bankAccount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get employmentType => $composableBuilder(
      column: $table.employmentType,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get joiningDate => $composableBuilder(
      column: $table.joiningDate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get userId => $composableBuilder(
      column: $table.userId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$EmployeesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $EmployeesTable> {
        $$EmployeesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get role => $composableBuilder(
      column: $table.role,
      builder: (column) => column);
      
GeneratedColumn<String> get position => $composableBuilder(
      column: $table.position,
      builder: (column) => column);
      
GeneratedColumn<String> get department => $composableBuilder(
      column: $table.department,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<String> get payType => $composableBuilder(
      column: $table.payType,
      builder: (column) => column);
      
GeneratedColumn<double> get salary => $composableBuilder(
      column: $table.salary,
      builder: (column) => column);
      
GeneratedColumn<double> get dailyRate => $composableBuilder(
      column: $table.dailyRate,
      builder: (column) => column);
      
GeneratedColumn<double> get daysWorked => $composableBuilder(
      column: $table.daysWorked,
      builder: (column) => column);
      
GeneratedColumn<double> get amountPaid => $composableBuilder(
      column: $table.amountPaid,
      builder: (column) => column);
      
GeneratedColumn<String> get phone => $composableBuilder(
      column: $table.phone,
      builder: (column) => column);
      
GeneratedColumn<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => column);
      
GeneratedColumn<String> get bankAccount => $composableBuilder(
      column: $table.bankAccount,
      builder: (column) => column);
      
GeneratedColumn<String> get employmentType => $composableBuilder(
      column: $table.employmentType,
      builder: (column) => column);
      
GeneratedColumn<String> get joiningDate => $composableBuilder(
      column: $table.joiningDate,
      builder: (column) => column);
      
GeneratedColumn<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => column);
      
GeneratedColumn<String> get userId => $composableBuilder(
      column: $table.userId,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$EmployeesTableTableManager extends RootTableManager    <_$AppDatabase,
    $EmployeesTable,
    Employee,
    $$EmployeesTableFilterComposer,
    $$EmployeesTableOrderingComposer,
    $$EmployeesTableAnnotationComposer,
    $$EmployeesTableCreateCompanionBuilder,
    $$EmployeesTableUpdateCompanionBuilder,
    (Employee,BaseReferences<_$AppDatabase,$EmployeesTable,Employee>),
    Employee,
    PrefetchHooks Function()
    > {
    $$EmployeesTableTableManager(_$AppDatabase db, $EmployeesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$EmployeesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$EmployeesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$EmployeesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> name = const Value.absent(),Value<String?> role = const Value.absent(),Value<String?> position = const Value.absent(),Value<String?> department = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> payType = const Value.absent(),Value<double?> salary = const Value.absent(),Value<double?> dailyRate = const Value.absent(),Value<double?> daysWorked = const Value.absent(),Value<double?> amountPaid = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> bankAccount = const Value.absent(),Value<String?> employmentType = const Value.absent(),Value<String?> joiningDate = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> userId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> EmployeesCompanion(id: id,tenantId: tenantId,name: name,role: role,position: position,department: department,status: status,payType: payType,salary: salary,dailyRate: dailyRate,daysWorked: daysWorked,amountPaid: amountPaid,phone: phone,email: email,bankAccount: bankAccount,employmentType: employmentType,joiningDate: joiningDate,notes: notes,userId: userId,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> name = const Value.absent(),Value<String?> role = const Value.absent(),Value<String?> position = const Value.absent(),Value<String?> department = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> payType = const Value.absent(),Value<double?> salary = const Value.absent(),Value<double?> dailyRate = const Value.absent(),Value<double?> daysWorked = const Value.absent(),Value<double?> amountPaid = const Value.absent(),Value<String?> phone = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> bankAccount = const Value.absent(),Value<String?> employmentType = const Value.absent(),Value<String?> joiningDate = const Value.absent(),Value<String?> notes = const Value.absent(),Value<String?> userId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> EmployeesCompanion.insert(id: id,tenantId: tenantId,name: name,role: role,position: position,department: department,status: status,payType: payType,salary: salary,dailyRate: dailyRate,daysWorked: daysWorked,amountPaid: amountPaid,phone: phone,email: email,bankAccount: bankAccount,employmentType: employmentType,joiningDate: joiningDate,notes: notes,userId: userId,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$EmployeesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $EmployeesTable,
    Employee,
    $$EmployeesTableFilterComposer,
    $$EmployeesTableOrderingComposer,
    $$EmployeesTableAnnotationComposer,
    $$EmployeesTableCreateCompanionBuilder,
    $$EmployeesTableUpdateCompanionBuilder,
    (Employee,BaseReferences<_$AppDatabase,$EmployeesTable,Employee>),
    Employee,
    PrefetchHooks Function()
    >;typedef $$InventoryLocationsTableCreateCompanionBuilder = InventoryLocationsCompanion Function({required String id,required String tenantId,required String name,required String type,Value<String?> referenceId,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$InventoryLocationsTableUpdateCompanionBuilder = InventoryLocationsCompanion Function({Value<String> id,Value<String> tenantId,Value<String> name,Value<String> type,Value<String?> referenceId,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$InventoryLocationsTableFilterComposer extends Composer<
        _$AppDatabase,
        $InventoryLocationsTable> {
        $$InventoryLocationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get referenceId => $composableBuilder(
      column: $table.referenceId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$InventoryLocationsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $InventoryLocationsTable> {
        $$InventoryLocationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get referenceId => $composableBuilder(
      column: $table.referenceId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$InventoryLocationsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $InventoryLocationsTable> {
        $$InventoryLocationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => column);
      
GeneratedColumn<String> get referenceId => $composableBuilder(
      column: $table.referenceId,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$InventoryLocationsTableTableManager extends RootTableManager    <_$AppDatabase,
    $InventoryLocationsTable,
    InventoryLocation,
    $$InventoryLocationsTableFilterComposer,
    $$InventoryLocationsTableOrderingComposer,
    $$InventoryLocationsTableAnnotationComposer,
    $$InventoryLocationsTableCreateCompanionBuilder,
    $$InventoryLocationsTableUpdateCompanionBuilder,
    (InventoryLocation,BaseReferences<_$AppDatabase,$InventoryLocationsTable,InventoryLocation>),
    InventoryLocation,
    PrefetchHooks Function()
    > {
    $$InventoryLocationsTableTableManager(_$AppDatabase db, $InventoryLocationsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$InventoryLocationsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$InventoryLocationsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$InventoryLocationsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> name = const Value.absent(),Value<String> type = const Value.absent(),Value<String?> referenceId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InventoryLocationsCompanion(id: id,tenantId: tenantId,name: name,type: type,referenceId: referenceId,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String name,required String type,Value<String?> referenceId = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InventoryLocationsCompanion.insert(id: id,tenantId: tenantId,name: name,type: type,referenceId: referenceId,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$InventoryLocationsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $InventoryLocationsTable,
    InventoryLocation,
    $$InventoryLocationsTableFilterComposer,
    $$InventoryLocationsTableOrderingComposer,
    $$InventoryLocationsTableAnnotationComposer,
    $$InventoryLocationsTableCreateCompanionBuilder,
    $$InventoryLocationsTableUpdateCompanionBuilder,
    (InventoryLocation,BaseReferences<_$AppDatabase,$InventoryLocationsTable,InventoryLocation>),
    InventoryLocation,
    PrefetchHooks Function()
    >;typedef $$InventoryBalancesTableCreateCompanionBuilder = InventoryBalancesCompanion Function({required String id,required String tenantId,required String productId,Value<String?> locationId,Value<double?> quantity,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$InventoryBalancesTableUpdateCompanionBuilder = InventoryBalancesCompanion Function({Value<String> id,Value<String> tenantId,Value<String> productId,Value<String?> locationId,Value<double?> quantity,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$InventoryBalancesTableFilterComposer extends Composer<
        _$AppDatabase,
        $InventoryBalancesTable> {
        $$InventoryBalancesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$InventoryBalancesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $InventoryBalancesTable> {
        $$InventoryBalancesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$InventoryBalancesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $InventoryBalancesTable> {
        $$InventoryBalancesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => column);
      
GeneratedColumn<String> get locationId => $composableBuilder(
      column: $table.locationId,
      builder: (column) => column);
      
GeneratedColumn<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$InventoryBalancesTableTableManager extends RootTableManager    <_$AppDatabase,
    $InventoryBalancesTable,
    InventoryBalance,
    $$InventoryBalancesTableFilterComposer,
    $$InventoryBalancesTableOrderingComposer,
    $$InventoryBalancesTableAnnotationComposer,
    $$InventoryBalancesTableCreateCompanionBuilder,
    $$InventoryBalancesTableUpdateCompanionBuilder,
    (InventoryBalance,BaseReferences<_$AppDatabase,$InventoryBalancesTable,InventoryBalance>),
    InventoryBalance,
    PrefetchHooks Function()
    > {
    $$InventoryBalancesTableTableManager(_$AppDatabase db, $InventoryBalancesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$InventoryBalancesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$InventoryBalancesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$InventoryBalancesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> productId = const Value.absent(),Value<String?> locationId = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InventoryBalancesCompanion(id: id,tenantId: tenantId,productId: productId,locationId: locationId,quantity: quantity,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String productId,Value<String?> locationId = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> InventoryBalancesCompanion.insert(id: id,tenantId: tenantId,productId: productId,locationId: locationId,quantity: quantity,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$InventoryBalancesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $InventoryBalancesTable,
    InventoryBalance,
    $$InventoryBalancesTableFilterComposer,
    $$InventoryBalancesTableOrderingComposer,
    $$InventoryBalancesTableAnnotationComposer,
    $$InventoryBalancesTableCreateCompanionBuilder,
    $$InventoryBalancesTableUpdateCompanionBuilder,
    (InventoryBalance,BaseReferences<_$AppDatabase,$InventoryBalancesTable,InventoryBalance>),
    InventoryBalance,
    PrefetchHooks Function()
    >;typedef $$ProductBatchesTableCreateCompanionBuilder = ProductBatchesCompanion Function({required String id,required String tenantId,required String productId,Value<String?> purchaseId,Value<String?> supplierId,Value<String?> warehouseId,Value<String?> receivedDate,Value<String?> expiryDate,Value<double?> unitCost,Value<double?> qtyReceived,Value<double?> qtyRemaining,Value<String?> origin,Value<String?> costBasis,Value<String?> note,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$ProductBatchesTableUpdateCompanionBuilder = ProductBatchesCompanion Function({Value<String> id,Value<String> tenantId,Value<String> productId,Value<String?> purchaseId,Value<String?> supplierId,Value<String?> warehouseId,Value<String?> receivedDate,Value<String?> expiryDate,Value<double?> unitCost,Value<double?> qtyReceived,Value<double?> qtyRemaining,Value<String?> origin,Value<String?> costBasis,Value<String?> note,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$ProductBatchesTableFilterComposer extends Composer<
        _$AppDatabase,
        $ProductBatchesTable> {
        $$ProductBatchesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get warehouseId => $composableBuilder(
      column: $table.warehouseId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get receivedDate => $composableBuilder(
      column: $table.receivedDate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get expiryDate => $composableBuilder(
      column: $table.expiryDate,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get unitCost => $composableBuilder(
      column: $table.unitCost,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get qtyReceived => $composableBuilder(
      column: $table.qtyReceived,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get qtyRemaining => $composableBuilder(
      column: $table.qtyRemaining,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get origin => $composableBuilder(
      column: $table.origin,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get costBasis => $composableBuilder(
      column: $table.costBasis,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$ProductBatchesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $ProductBatchesTable> {
        $$ProductBatchesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get warehouseId => $composableBuilder(
      column: $table.warehouseId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get receivedDate => $composableBuilder(
      column: $table.receivedDate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get expiryDate => $composableBuilder(
      column: $table.expiryDate,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get unitCost => $composableBuilder(
      column: $table.unitCost,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get qtyReceived => $composableBuilder(
      column: $table.qtyReceived,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get qtyRemaining => $composableBuilder(
      column: $table.qtyRemaining,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get origin => $composableBuilder(
      column: $table.origin,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get costBasis => $composableBuilder(
      column: $table.costBasis,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$ProductBatchesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $ProductBatchesTable> {
        $$ProductBatchesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => column);
      
GeneratedColumn<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => column);
      
GeneratedColumn<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => column);
      
GeneratedColumn<String> get warehouseId => $composableBuilder(
      column: $table.warehouseId,
      builder: (column) => column);
      
GeneratedColumn<String> get receivedDate => $composableBuilder(
      column: $table.receivedDate,
      builder: (column) => column);
      
GeneratedColumn<String> get expiryDate => $composableBuilder(
      column: $table.expiryDate,
      builder: (column) => column);
      
GeneratedColumn<double> get unitCost => $composableBuilder(
      column: $table.unitCost,
      builder: (column) => column);
      
GeneratedColumn<double> get qtyReceived => $composableBuilder(
      column: $table.qtyReceived,
      builder: (column) => column);
      
GeneratedColumn<double> get qtyRemaining => $composableBuilder(
      column: $table.qtyRemaining,
      builder: (column) => column);
      
GeneratedColumn<String> get origin => $composableBuilder(
      column: $table.origin,
      builder: (column) => column);
      
GeneratedColumn<String> get costBasis => $composableBuilder(
      column: $table.costBasis,
      builder: (column) => column);
      
GeneratedColumn<String> get note => $composableBuilder(
      column: $table.note,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$ProductBatchesTableTableManager extends RootTableManager    <_$AppDatabase,
    $ProductBatchesTable,
    ProductBatche,
    $$ProductBatchesTableFilterComposer,
    $$ProductBatchesTableOrderingComposer,
    $$ProductBatchesTableAnnotationComposer,
    $$ProductBatchesTableCreateCompanionBuilder,
    $$ProductBatchesTableUpdateCompanionBuilder,
    (ProductBatche,BaseReferences<_$AppDatabase,$ProductBatchesTable,ProductBatche>),
    ProductBatche,
    PrefetchHooks Function()
    > {
    $$ProductBatchesTableTableManager(_$AppDatabase db, $ProductBatchesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$ProductBatchesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$ProductBatchesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$ProductBatchesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> productId = const Value.absent(),Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> warehouseId = const Value.absent(),Value<String?> receivedDate = const Value.absent(),Value<String?> expiryDate = const Value.absent(),Value<double?> unitCost = const Value.absent(),Value<double?> qtyReceived = const Value.absent(),Value<double?> qtyRemaining = const Value.absent(),Value<String?> origin = const Value.absent(),Value<String?> costBasis = const Value.absent(),Value<String?> note = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ProductBatchesCompanion(id: id,tenantId: tenantId,productId: productId,purchaseId: purchaseId,supplierId: supplierId,warehouseId: warehouseId,receivedDate: receivedDate,expiryDate: expiryDate,unitCost: unitCost,qtyReceived: qtyReceived,qtyRemaining: qtyRemaining,origin: origin,costBasis: costBasis,note: note,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String productId,Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> warehouseId = const Value.absent(),Value<String?> receivedDate = const Value.absent(),Value<String?> expiryDate = const Value.absent(),Value<double?> unitCost = const Value.absent(),Value<double?> qtyReceived = const Value.absent(),Value<double?> qtyRemaining = const Value.absent(),Value<String?> origin = const Value.absent(),Value<String?> costBasis = const Value.absent(),Value<String?> note = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> ProductBatchesCompanion.insert(id: id,tenantId: tenantId,productId: productId,purchaseId: purchaseId,supplierId: supplierId,warehouseId: warehouseId,receivedDate: receivedDate,expiryDate: expiryDate,unitCost: unitCost,qtyReceived: qtyReceived,qtyRemaining: qtyRemaining,origin: origin,costBasis: costBasis,note: note,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$ProductBatchesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $ProductBatchesTable,
    ProductBatche,
    $$ProductBatchesTableFilterComposer,
    $$ProductBatchesTableOrderingComposer,
    $$ProductBatchesTableAnnotationComposer,
    $$ProductBatchesTableCreateCompanionBuilder,
    $$ProductBatchesTableUpdateCompanionBuilder,
    (ProductBatche,BaseReferences<_$AppDatabase,$ProductBatchesTable,ProductBatche>),
    ProductBatche,
    PrefetchHooks Function()
    >;typedef $$VehiclesTableCreateCompanionBuilder = VehiclesCompanion Function({required String id,required String tenantId,Value<String?> name,Value<String?> plateNumber,Value<String?> type,Value<String?> status,Value<double?> capacity,Value<String?> fuelType,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$VehiclesTableUpdateCompanionBuilder = VehiclesCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> name,Value<String?> plateNumber,Value<String?> type,Value<String?> status,Value<double?> capacity,Value<String?> fuelType,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$VehiclesTableFilterComposer extends Composer<
        _$AppDatabase,
        $VehiclesTable> {
        $$VehiclesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get plateNumber => $composableBuilder(
      column: $table.plateNumber,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get capacity => $composableBuilder(
      column: $table.capacity,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get fuelType => $composableBuilder(
      column: $table.fuelType,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$VehiclesTableOrderingComposer extends Composer<
        _$AppDatabase,
        $VehiclesTable> {
        $$VehiclesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get plateNumber => $composableBuilder(
      column: $table.plateNumber,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get capacity => $composableBuilder(
      column: $table.capacity,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get fuelType => $composableBuilder(
      column: $table.fuelType,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$VehiclesTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $VehiclesTable> {
        $$VehiclesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get plateNumber => $composableBuilder(
      column: $table.plateNumber,
      builder: (column) => column);
      
GeneratedColumn<String> get type => $composableBuilder(
      column: $table.type,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<double> get capacity => $composableBuilder(
      column: $table.capacity,
      builder: (column) => column);
      
GeneratedColumn<String> get fuelType => $composableBuilder(
      column: $table.fuelType,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$VehiclesTableTableManager extends RootTableManager    <_$AppDatabase,
    $VehiclesTable,
    Vehicle,
    $$VehiclesTableFilterComposer,
    $$VehiclesTableOrderingComposer,
    $$VehiclesTableAnnotationComposer,
    $$VehiclesTableCreateCompanionBuilder,
    $$VehiclesTableUpdateCompanionBuilder,
    (Vehicle,BaseReferences<_$AppDatabase,$VehiclesTable,Vehicle>),
    Vehicle,
    PrefetchHooks Function()
    > {
    $$VehiclesTableTableManager(_$AppDatabase db, $VehiclesTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$VehiclesTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$VehiclesTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$VehiclesTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> name = const Value.absent(),Value<String?> plateNumber = const Value.absent(),Value<String?> type = const Value.absent(),Value<String?> status = const Value.absent(),Value<double?> capacity = const Value.absent(),Value<String?> fuelType = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> VehiclesCompanion(id: id,tenantId: tenantId,name: name,plateNumber: plateNumber,type: type,status: status,capacity: capacity,fuelType: fuelType,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> name = const Value.absent(),Value<String?> plateNumber = const Value.absent(),Value<String?> type = const Value.absent(),Value<String?> status = const Value.absent(),Value<double?> capacity = const Value.absent(),Value<String?> fuelType = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> VehiclesCompanion.insert(id: id,tenantId: tenantId,name: name,plateNumber: plateNumber,type: type,status: status,capacity: capacity,fuelType: fuelType,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$VehiclesTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $VehiclesTable,
    Vehicle,
    $$VehiclesTableFilterComposer,
    $$VehiclesTableOrderingComposer,
    $$VehiclesTableAnnotationComposer,
    $$VehiclesTableCreateCompanionBuilder,
    $$VehiclesTableUpdateCompanionBuilder,
    (Vehicle,BaseReferences<_$AppDatabase,$VehiclesTable,Vehicle>),
    Vehicle,
    PrefetchHooks Function()
    >;typedef $$RouteStopsTableCreateCompanionBuilder = RouteStopsCompanion Function({required String id,required String tenantId,required String routeId,Value<String?> invoiceId,Value<String?> clientId,Value<String?> clientName,Value<int?> sequence,Value<String?> status,Value<String?> notes,Value<double?> cashCollected,Value<String?> itemsDeliveredJson,Value<DateTime?> visitedAt,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$RouteStopsTableUpdateCompanionBuilder = RouteStopsCompanion Function({Value<String> id,Value<String> tenantId,Value<String> routeId,Value<String?> invoiceId,Value<String?> clientId,Value<String?> clientName,Value<int?> sequence,Value<String?> status,Value<String?> notes,Value<double?> cashCollected,Value<String?> itemsDeliveredJson,Value<DateTime?> visitedAt,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$RouteStopsTableFilterComposer extends Composer<
        _$AppDatabase,
        $RouteStopsTable> {
        $$RouteStopsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get routeId => $composableBuilder(
      column: $table.routeId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get invoiceId => $composableBuilder(
      column: $table.invoiceId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<int> get sequence => $composableBuilder(
      column: $table.sequence,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get itemsDeliveredJson => $composableBuilder(
      column: $table.itemsDeliveredJson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get visitedAt => $composableBuilder(
      column: $table.visitedAt,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$RouteStopsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $RouteStopsTable> {
        $$RouteStopsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get routeId => $composableBuilder(
      column: $table.routeId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get invoiceId => $composableBuilder(
      column: $table.invoiceId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<int> get sequence => $composableBuilder(
      column: $table.sequence,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get itemsDeliveredJson => $composableBuilder(
      column: $table.itemsDeliveredJson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get visitedAt => $composableBuilder(
      column: $table.visitedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$RouteStopsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $RouteStopsTable> {
        $$RouteStopsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get routeId => $composableBuilder(
      column: $table.routeId,
      builder: (column) => column);
      
GeneratedColumn<String> get invoiceId => $composableBuilder(
      column: $table.invoiceId,
      builder: (column) => column);
      
GeneratedColumn<String> get clientId => $composableBuilder(
      column: $table.clientId,
      builder: (column) => column);
      
GeneratedColumn<String> get clientName => $composableBuilder(
      column: $table.clientName,
      builder: (column) => column);
      
GeneratedColumn<int> get sequence => $composableBuilder(
      column: $table.sequence,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<String> get notes => $composableBuilder(
      column: $table.notes,
      builder: (column) => column);
      
GeneratedColumn<double> get cashCollected => $composableBuilder(
      column: $table.cashCollected,
      builder: (column) => column);
      
GeneratedColumn<String> get itemsDeliveredJson => $composableBuilder(
      column: $table.itemsDeliveredJson,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get visitedAt => $composableBuilder(
      column: $table.visitedAt,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$RouteStopsTableTableManager extends RootTableManager    <_$AppDatabase,
    $RouteStopsTable,
    RouteStop,
    $$RouteStopsTableFilterComposer,
    $$RouteStopsTableOrderingComposer,
    $$RouteStopsTableAnnotationComposer,
    $$RouteStopsTableCreateCompanionBuilder,
    $$RouteStopsTableUpdateCompanionBuilder,
    (RouteStop,BaseReferences<_$AppDatabase,$RouteStopsTable,RouteStop>),
    RouteStop,
    PrefetchHooks Function()
    > {
    $$RouteStopsTableTableManager(_$AppDatabase db, $RouteStopsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$RouteStopsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$RouteStopsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$RouteStopsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String> routeId = const Value.absent(),Value<String?> invoiceId = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<int?> sequence = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> notes = const Value.absent(),Value<double?> cashCollected = const Value.absent(),Value<String?> itemsDeliveredJson = const Value.absent(),Value<DateTime?> visitedAt = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> RouteStopsCompanion(id: id,tenantId: tenantId,routeId: routeId,invoiceId: invoiceId,clientId: clientId,clientName: clientName,sequence: sequence,status: status,notes: notes,cashCollected: cashCollected,itemsDeliveredJson: itemsDeliveredJson,visitedAt: visitedAt,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,required String routeId,Value<String?> invoiceId = const Value.absent(),Value<String?> clientId = const Value.absent(),Value<String?> clientName = const Value.absent(),Value<int?> sequence = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> notes = const Value.absent(),Value<double?> cashCollected = const Value.absent(),Value<String?> itemsDeliveredJson = const Value.absent(),Value<DateTime?> visitedAt = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> RouteStopsCompanion.insert(id: id,tenantId: tenantId,routeId: routeId,invoiceId: invoiceId,clientId: clientId,clientName: clientName,sequence: sequence,status: status,notes: notes,cashCollected: cashCollected,itemsDeliveredJson: itemsDeliveredJson,visitedAt: visitedAt,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$RouteStopsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $RouteStopsTable,
    RouteStop,
    $$RouteStopsTableFilterComposer,
    $$RouteStopsTableOrderingComposer,
    $$RouteStopsTableAnnotationComposer,
    $$RouteStopsTableCreateCompanionBuilder,
    $$RouteStopsTableUpdateCompanionBuilder,
    (RouteStop,BaseReferences<_$AppDatabase,$RouteStopsTable,RouteStop>),
    RouteStop,
    PrefetchHooks Function()
    >;typedef $$PurchaseReturnsTableCreateCompanionBuilder = PurchaseReturnsCompanion Function({required String id,required String tenantId,Value<String?> purchaseId,Value<String?> supplierId,Value<String?> supplierName,Value<String?> productId,Value<String?> productName,Value<double?> quantity,Value<double?> unitPrice,Value<double?> totalAmount,Value<String?> reason,Value<String?> date,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$PurchaseReturnsTableUpdateCompanionBuilder = PurchaseReturnsCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> purchaseId,Value<String?> supplierId,Value<String?> supplierName,Value<String?> productId,Value<String?> productName,Value<double?> quantity,Value<double?> unitPrice,Value<double?> totalAmount,Value<String?> reason,Value<String?> date,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$PurchaseReturnsTableFilterComposer extends Composer<
        _$AppDatabase,
        $PurchaseReturnsTable> {
        $$PurchaseReturnsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get supplierName => $composableBuilder(
      column: $table.supplierName,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get productName => $composableBuilder(
      column: $table.productName,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get unitPrice => $composableBuilder(
      column: $table.unitPrice,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get reason => $composableBuilder(
      column: $table.reason,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$PurchaseReturnsTableOrderingComposer extends Composer<
        _$AppDatabase,
        $PurchaseReturnsTable> {
        $$PurchaseReturnsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get supplierName => $composableBuilder(
      column: $table.supplierName,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get productName => $composableBuilder(
      column: $table.productName,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get unitPrice => $composableBuilder(
      column: $table.unitPrice,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get reason => $composableBuilder(
      column: $table.reason,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$PurchaseReturnsTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $PurchaseReturnsTable> {
        $$PurchaseReturnsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get purchaseId => $composableBuilder(
      column: $table.purchaseId,
      builder: (column) => column);
      
GeneratedColumn<String> get supplierId => $composableBuilder(
      column: $table.supplierId,
      builder: (column) => column);
      
GeneratedColumn<String> get supplierName => $composableBuilder(
      column: $table.supplierName,
      builder: (column) => column);
      
GeneratedColumn<String> get productId => $composableBuilder(
      column: $table.productId,
      builder: (column) => column);
      
GeneratedColumn<String> get productName => $composableBuilder(
      column: $table.productName,
      builder: (column) => column);
      
GeneratedColumn<double> get quantity => $composableBuilder(
      column: $table.quantity,
      builder: (column) => column);
      
GeneratedColumn<double> get unitPrice => $composableBuilder(
      column: $table.unitPrice,
      builder: (column) => column);
      
GeneratedColumn<double> get totalAmount => $composableBuilder(
      column: $table.totalAmount,
      builder: (column) => column);
      
GeneratedColumn<String> get reason => $composableBuilder(
      column: $table.reason,
      builder: (column) => column);
      
GeneratedColumn<String> get date => $composableBuilder(
      column: $table.date,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$PurchaseReturnsTableTableManager extends RootTableManager    <_$AppDatabase,
    $PurchaseReturnsTable,
    PurchaseReturn,
    $$PurchaseReturnsTableFilterComposer,
    $$PurchaseReturnsTableOrderingComposer,
    $$PurchaseReturnsTableAnnotationComposer,
    $$PurchaseReturnsTableCreateCompanionBuilder,
    $$PurchaseReturnsTableUpdateCompanionBuilder,
    (PurchaseReturn,BaseReferences<_$AppDatabase,$PurchaseReturnsTable,PurchaseReturn>),
    PurchaseReturn,
    PrefetchHooks Function()
    > {
    $$PurchaseReturnsTableTableManager(_$AppDatabase db, $PurchaseReturnsTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$PurchaseReturnsTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$PurchaseReturnsTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$PurchaseReturnsTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> supplierName = const Value.absent(),Value<String?> productId = const Value.absent(),Value<String?> productName = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<double?> unitPrice = const Value.absent(),Value<double?> totalAmount = const Value.absent(),Value<String?> reason = const Value.absent(),Value<String?> date = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> PurchaseReturnsCompanion(id: id,tenantId: tenantId,purchaseId: purchaseId,supplierId: supplierId,supplierName: supplierName,productId: productId,productName: productName,quantity: quantity,unitPrice: unitPrice,totalAmount: totalAmount,reason: reason,date: date,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> purchaseId = const Value.absent(),Value<String?> supplierId = const Value.absent(),Value<String?> supplierName = const Value.absent(),Value<String?> productId = const Value.absent(),Value<String?> productName = const Value.absent(),Value<double?> quantity = const Value.absent(),Value<double?> unitPrice = const Value.absent(),Value<double?> totalAmount = const Value.absent(),Value<String?> reason = const Value.absent(),Value<String?> date = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> PurchaseReturnsCompanion.insert(id: id,tenantId: tenantId,purchaseId: purchaseId,supplierId: supplierId,supplierName: supplierName,productId: productId,productName: productName,quantity: quantity,unitPrice: unitPrice,totalAmount: totalAmount,reason: reason,date: date,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$PurchaseReturnsTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $PurchaseReturnsTable,
    PurchaseReturn,
    $$PurchaseReturnsTableFilterComposer,
    $$PurchaseReturnsTableOrderingComposer,
    $$PurchaseReturnsTableAnnotationComposer,
    $$PurchaseReturnsTableCreateCompanionBuilder,
    $$PurchaseReturnsTableUpdateCompanionBuilder,
    (PurchaseReturn,BaseReferences<_$AppDatabase,$PurchaseReturnsTable,PurchaseReturn>),
    PurchaseReturn,
    PrefetchHooks Function()
    >;typedef $$UsersLocalTableCreateCompanionBuilder = UsersLocalCompanion Function({required String id,required String tenantId,Value<String?> name,Value<String?> email,Value<String?> status,Value<String?> avatarUrl,Value<String?> rolesJson,Value<String?> permissionsJson,Value<DateTime?> updatedAt,Value<int> rowid,});
typedef $$UsersLocalTableUpdateCompanionBuilder = UsersLocalCompanion Function({Value<String> id,Value<String> tenantId,Value<String?> name,Value<String?> email,Value<String?> status,Value<String?> avatarUrl,Value<String?> rolesJson,Value<String?> permissionsJson,Value<DateTime?> updatedAt,Value<int> rowid,});
class $$UsersLocalTableFilterComposer extends Composer<
        _$AppDatabase,
        $UsersLocalTable> {
        $$UsersLocalTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnFilters<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get avatarUrl => $composableBuilder(
      column: $table.avatarUrl,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get rolesJson => $composableBuilder(
      column: $table.rolesJson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<String> get permissionsJson => $composableBuilder(
      column: $table.permissionsJson,
      builder: (column) => 
      ColumnFilters(column));
      
ColumnFilters<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnFilters(column));
      
        }
      class $$UsersLocalTableOrderingComposer extends Composer<
        _$AppDatabase,
        $UsersLocalTable> {
        $$UsersLocalTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          ColumnOrderings<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get avatarUrl => $composableBuilder(
      column: $table.avatarUrl,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get rolesJson => $composableBuilder(
      column: $table.rolesJson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<String> get permissionsJson => $composableBuilder(
      column: $table.permissionsJson,
      builder: (column) => 
      ColumnOrderings(column));
      
ColumnOrderings<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => 
      ColumnOrderings(column));
      
        }
      class $$UsersLocalTableAnnotationComposer extends Composer<
        _$AppDatabase,
        $UsersLocalTable> {
        $$UsersLocalTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
          GeneratedColumn<String> get id => $composableBuilder(
      column: $table.id,
      builder: (column) => column);
      
GeneratedColumn<String> get tenantId => $composableBuilder(
      column: $table.tenantId,
      builder: (column) => column);
      
GeneratedColumn<String> get name => $composableBuilder(
      column: $table.name,
      builder: (column) => column);
      
GeneratedColumn<String> get email => $composableBuilder(
      column: $table.email,
      builder: (column) => column);
      
GeneratedColumn<String> get status => $composableBuilder(
      column: $table.status,
      builder: (column) => column);
      
GeneratedColumn<String> get avatarUrl => $composableBuilder(
      column: $table.avatarUrl,
      builder: (column) => column);
      
GeneratedColumn<String> get rolesJson => $composableBuilder(
      column: $table.rolesJson,
      builder: (column) => column);
      
GeneratedColumn<String> get permissionsJson => $composableBuilder(
      column: $table.permissionsJson,
      builder: (column) => column);
      
GeneratedColumn<DateTime> get updatedAt => $composableBuilder(
      column: $table.updatedAt,
      builder: (column) => column);
      
        }
      class $$UsersLocalTableTableManager extends RootTableManager    <_$AppDatabase,
    $UsersLocalTable,
    UsersLocalData,
    $$UsersLocalTableFilterComposer,
    $$UsersLocalTableOrderingComposer,
    $$UsersLocalTableAnnotationComposer,
    $$UsersLocalTableCreateCompanionBuilder,
    $$UsersLocalTableUpdateCompanionBuilder,
    (UsersLocalData,BaseReferences<_$AppDatabase,$UsersLocalTable,UsersLocalData>),
    UsersLocalData,
    PrefetchHooks Function()
    > {
    $$UsersLocalTableTableManager(_$AppDatabase db, $UsersLocalTable table) : super(
      TableManagerState(
        db: db,
        table: table,
        createFilteringComposer: () => $$UsersLocalTableFilterComposer($db: db,$table:table),
        createOrderingComposer: () => $$UsersLocalTableOrderingComposer($db: db,$table:table),
        createComputedFieldComposer: () => $$UsersLocalTableAnnotationComposer($db: db,$table:table),
        updateCompanionCallback: ({Value<String> id = const Value.absent(),Value<String> tenantId = const Value.absent(),Value<String?> name = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> avatarUrl = const Value.absent(),Value<String?> rolesJson = const Value.absent(),Value<String?> permissionsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> UsersLocalCompanion(id: id,tenantId: tenantId,name: name,email: email,status: status,avatarUrl: avatarUrl,rolesJson: rolesJson,permissionsJson: permissionsJson,updatedAt: updatedAt,rowid: rowid,),
        createCompanionCallback: ({required String id,required String tenantId,Value<String?> name = const Value.absent(),Value<String?> email = const Value.absent(),Value<String?> status = const Value.absent(),Value<String?> avatarUrl = const Value.absent(),Value<String?> rolesJson = const Value.absent(),Value<String?> permissionsJson = const Value.absent(),Value<DateTime?> updatedAt = const Value.absent(),Value<int> rowid = const Value.absent(),})=> UsersLocalCompanion.insert(id: id,tenantId: tenantId,name: name,email: email,status: status,avatarUrl: avatarUrl,rolesJson: rolesJson,permissionsJson: permissionsJson,updatedAt: updatedAt,rowid: rowid,),
        withReferenceMapper: (p0) => p0
              .map(
                  (e) =>
                     (e.readTable(table), BaseReferences(db, table, e))
                  )
              .toList(),
        prefetchHooksCallback: null,
        ));
        }
    typedef $$UsersLocalTableProcessedTableManager = ProcessedTableManager    <_$AppDatabase,
    $UsersLocalTable,
    UsersLocalData,
    $$UsersLocalTableFilterComposer,
    $$UsersLocalTableOrderingComposer,
    $$UsersLocalTableAnnotationComposer,
    $$UsersLocalTableCreateCompanionBuilder,
    $$UsersLocalTableUpdateCompanionBuilder,
    (UsersLocalData,BaseReferences<_$AppDatabase,$UsersLocalTable,UsersLocalData>),
    UsersLocalData,
    PrefetchHooks Function()
    >;class $AppDatabaseManager {
final _$AppDatabase _db;
$AppDatabaseManager(this._db);
$$SyncMutationsTableTableManager get syncMutations => $$SyncMutationsTableTableManager(_db, _db.syncMutations);
$$TenantsTableTableManager get tenants => $$TenantsTableTableManager(_db, _db.tenants);
$$ProductsTableTableManager get products => $$ProductsTableTableManager(_db, _db.products);
$$ClientsTableTableManager get clients => $$ClientsTableTableManager(_db, _db.clients);
$$SalesTableTableManager get sales => $$SalesTableTableManager(_db, _db.sales);
$$ExpensesTableTableManager get expenses => $$ExpensesTableTableManager(_db, _db.expenses);
$$SuppliersTableTableManager get suppliers => $$SuppliersTableTableManager(_db, _db.suppliers);
$$PurchasesTableTableManager get purchases => $$PurchasesTableTableManager(_db, _db.purchases);
$$InvoicesTableTableManager get invoices => $$InvoicesTableTableManager(_db, _db.invoices);
$$BusinessProfileLocalTableTableManager get businessProfileLocal => $$BusinessProfileLocalTableTableManager(_db, _db.businessProfileLocal);
$$RoutesTableTableManager get routes => $$RoutesTableTableManager(_db, _db.routes);
$$DayBookLocalTableTableManager get dayBookLocal => $$DayBookLocalTableTableManager(_db, _db.dayBookLocal);
$$ClientPaymentsTableTableManager get clientPayments => $$ClientPaymentsTableTableManager(_db, _db.clientPayments);
$$EmployeesTableTableManager get employees => $$EmployeesTableTableManager(_db, _db.employees);
$$InventoryLocationsTableTableManager get inventoryLocations => $$InventoryLocationsTableTableManager(_db, _db.inventoryLocations);
$$InventoryBalancesTableTableManager get inventoryBalances => $$InventoryBalancesTableTableManager(_db, _db.inventoryBalances);
$$ProductBatchesTableTableManager get productBatches => $$ProductBatchesTableTableManager(_db, _db.productBatches);
$$VehiclesTableTableManager get vehicles => $$VehiclesTableTableManager(_db, _db.vehicles);
$$RouteStopsTableTableManager get routeStops => $$RouteStopsTableTableManager(_db, _db.routeStops);
$$PurchaseReturnsTableTableManager get purchaseReturns => $$PurchaseReturnsTableTableManager(_db, _db.purchaseReturns);
$$UsersLocalTableTableManager get usersLocal => $$UsersLocalTableTableManager(_db, _db.usersLocal);
}
