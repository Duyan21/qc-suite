import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProjectsTab } from '@/pages/admin/ProjectsTab'
import { UsersAccessTab } from '@/pages/admin/UsersAccessTab'
import { RolesPermissionsTab } from '@/pages/admin/RolesPermissionsTab'

export function AdminPage() {
  return (
    <Tabs defaultValue="projects" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="users">Users & Access</TabsTrigger>
        <TabsTrigger value="roles">Roles & Permissions</TabsTrigger>
      </TabsList>
      <TabsContent value="projects">
        <ProjectsTab />
      </TabsContent>
      <TabsContent value="users">
        <UsersAccessTab />
      </TabsContent>
      <TabsContent value="roles">
        <RolesPermissionsTab />
      </TabsContent>
    </Tabs>
  )
}
