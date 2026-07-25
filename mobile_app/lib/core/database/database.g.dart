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
@override
Iterable<TableInfo<Table, Object?>> get allTables => allSchemaEntities.whereType<TableInfo<Table, Object?>>();
@override
List<DatabaseSchemaEntity> get allSchemaEntities => [syncMutations, tenants, products, clients, sales, expenses, suppliers, purchases, invoices, businessProfileLocal, routes];
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
}
